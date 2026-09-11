import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import type { Locale } from "@/lib/locales";

export type RelayChannel = "sheet" | "email";

export interface RelayItem {
  ticket_code: string;
  item: string;
  quantity: number;
  unit_price_eur: number;
  answers: Record<string, string>;
}

export interface RelayPayload {
  version: 2;
  channels: RelayChannel[];
  secret: string;
  order_id: string;
  paid_at: string;
  locale: Locale;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  activity: string;
  activity_display: string;
  edition: string;
  edition_ends_at: string;
  field_labels: string[];
  field_classifications: Record<string, "standard" | "identity" | "health">;
  payment_method: string;
  total_eur: number;
  ticket_url_base: string;
  items: RelayItem[];
}

interface OrderRow {
  id: string;
  paid_at: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  locale: Locale;
  edition: string | null;
  payment_method: string;
  total_cents: number;
  activity_title_ca: string;
  activity_title_es: string | null;
  activity_title_en: string | null;
  edition_ends_at: string | null;
}

interface ItemRow {
  id: string;
  ticket_code: string;
  quantity: number;
  unit_price_cents: number | null;
  variant_name: string;
}

interface AnswerRow {
  order_item_id: string;
  label_ca_snapshot: string;
  label_es_snapshot: string | null;
  label_en_snapshot: string | null;
  value_text: string;
  position: number;
  data_classification_snapshot: "standard" | "identity" | "health";
}

function localized(
  row: Record<string, unknown>,
  base: string,
  locale: Locale,
): string {
  const translated = row[`${base}_${locale}`];
  if (typeof translated === "string" && translated.trim()) return translated;
  const catalan = row[`${base}_ca`];
  return typeof catalan === "string" ? catalan : "";
}

export async function buildRelayPayload(
  orderId: string,
  origin: string,
  channels: RelayChannel[] = ["sheet", "email"],
): Promise<RelayPayload | null> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.SHEETS_RELAY_SECRET) return null;

  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT o.id, o.paid_at, o.buyer_name, o.buyer_email, o.buyer_phone,
              o.locale, o.edition, o.payment_method, o.total_cents,
              a.title_ca AS activity_title_ca,
              a.title_es AS activity_title_es,
              a.title_en AS activity_title_en,
              ae.ends_at AS edition_ends_at
         FROM "order" o JOIN activity a ON a.id = o.activity_id
         LEFT JOIN activity_edition ae ON ae.id = o.activity_edition_id
        WHERE o.id = ? AND o.status = 'paid'`,
    )
    .bind(orderId)
    .first<OrderRow>();
  if (!order) return null;

  const [{ results: items }, { results: answers }] = await Promise.all([
    db
      .prepare(
        `SELECT oi.id, oi.ticket_code, oi.quantity, oi.unit_price_cents,
                COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name
           FROM order_item oi JOIN variant v ON v.id = oi.variant_id
          WHERE oi.order_id = ? ORDER BY oi.id`,
      )
      .bind(orderId)
      .all<ItemRow>(),
    db
      .prepare(
        `SELECT a.order_item_id, a.label_ca_snapshot, a.label_es_snapshot,
                a.label_en_snapshot, a.value_text, a.position,
                a.data_classification_snapshot
           FROM order_item_answer a
           JOIN order_item oi ON oi.id = a.order_item_id
          WHERE oi.order_id = ?
          ORDER BY a.position, a.id`,
      )
      .bind(orderId)
      .all<AnswerRow>(),
  ]);

  const labels: string[] = [];
  const fieldClassifications: RelayPayload["field_classifications"] = {};
  const answersByItem = new Map<string, Record<string, string>>();
  for (const answer of answers) {
    const label = localized(answer as unknown as Record<string, unknown>, "label_snapshot", order.locale);
    if (!labels.includes(label)) labels.push(label);
    const previous = fieldClassifications[label];
    if (
      !previous ||
      answer.data_classification_snapshot === "health" ||
      (answer.data_classification_snapshot === "identity" && previous === "standard")
    ) {
      fieldClassifications[label] = answer.data_classification_snapshot;
    }
    const itemAnswers = answersByItem.get(answer.order_item_id) ?? {};
    itemAnswers[label] = answer.value_text;
    answersByItem.set(answer.order_item_id, itemAnswers);
  }

  return {
    version: 2,
    channels,
    secret: env.SHEETS_RELAY_SECRET,
    order_id: order.id,
    paid_at: order.paid_at ?? "",
    locale: order.locale,
    buyer_name: order.buyer_name,
    buyer_email: order.buyer_email,
    buyer_phone: order.buyer_phone ?? "",
    activity: order.activity_title_ca,
    activity_display: localized(
      order as unknown as Record<string, unknown>,
      "activity_title",
      order.locale,
    ),
    edition: order.edition ?? "",
    edition_ends_at: order.edition_ends_at ?? "",
    field_labels: labels,
    field_classifications: fieldClassifications,
    payment_method: order.payment_method,
    total_eur: order.total_cents / 100,
    ticket_url_base: `${origin}/${order.locale}/t/`,
    items: items.map((item) => ({
      ticket_code: item.ticket_code,
      item: item.variant_name,
      quantity: item.quantity,
      unit_price_eur: (item.unit_price_cents ?? 0) / 100,
      answers: answersByItem.get(item.id) ?? {},
    })),
  };
}

async function automaticChannels(orderId: string): Promise<RelayChannel[]> {
  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT relay_sheet_status, relay_email_status
         FROM "order" WHERE id = ? AND status = 'paid'`,
    )
    .bind(orderId)
    .first<{ relay_sheet_status: string; relay_email_status: string }>();
  if (!order) return [];
  const channels: RelayChannel[] = [];
  if (order.relay_sheet_status !== "sent") channels.push("sheet");
  if (order.relay_email_status === "pending" || order.relay_email_status === "failed") {
    channels.push("email");
  }
  return channels;
}

async function recordFailure(
  orderId: string,
  channels: RelayChannel[],
  message: string,
): Promise<void> {
  const db = await getDb();
  const statements = [
    db
      .prepare(
        `UPDATE "order"
            SET relay_attempts = relay_attempts + 1, relay_last_error = ?
          WHERE id = ?`,
      )
      .bind(message.slice(0, 1000), orderId),
  ];
  if (channels.includes("sheet")) {
    statements.push(
      db.prepare(`UPDATE "order" SET relay_sheet_status = 'failed' WHERE id = ?`).bind(orderId),
    );
  }
  if (channels.includes("email")) {
    statements.push(
      db.prepare(`UPDATE "order" SET relay_email_status = 'failed' WHERE id = ?`).bind(orderId),
    );
  }
  await db.batch(statements);
}

/** Deliver whichever channels remain pending, or the explicit channels chosen by an admin. */
export async function syncOrderToRelay(
  orderId: string,
  origin: string,
  requestedChannels?: RelayChannel[],
): Promise<boolean> {
  const channels = requestedChannels ?? await automaticChannels(orderId);
  if (channels.length === 0) return true;

  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.SHEETS_RELAY_URL) {
      await recordFailure(orderId, channels, "SHEETS_RELAY_URL is not configured");
      return false;
    }
    const payload = await buildRelayPayload(orderId, origin, channels);
    if (!payload) {
      await recordFailure(orderId, channels, "Relay payload could not be built");
      return false;
    }

    const response = await fetch(env.SHEETS_RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const raw = await response.text();
    let result: {
      ok?: boolean;
      sheet?: { sent?: boolean };
      email?: { sent?: boolean };
      error?: string;
    };
    try {
      result = JSON.parse(raw) as typeof result;
    } catch {
      result = { ok: false, error: raw.slice(0, 300) };
    }
    if (!response.ok || !result.ok) {
      await recordFailure(
        orderId,
        channels,
        result.error || `Relay HTTP ${response.status}`,
      );
      return false;
    }

    const db = await getDb();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE "order"
              SET relay_attempts = relay_attempts + 1, relay_last_error = NULL
            WHERE id = ?`,
        )
        .bind(orderId),
    ];
    let successful = true;
    if (channels.includes("sheet")) {
      const sent = result.sheet?.sent === true;
      successful &&= sent;
      statements.push(
        db
          .prepare(
            `UPDATE "order"
                SET relay_sheet_status = ?,
                    relay_sheet_synced_at = CASE WHEN ? = 1 THEN datetime('now') ELSE relay_sheet_synced_at END
              WHERE id = ?`,
          )
          .bind(sent ? "sent" : "failed", sent ? 1 : 0, orderId),
      );
    }
    if (channels.includes("email")) {
      const sent = result.email?.sent === true;
      successful &&= sent;
      statements.push(
        db
          .prepare(
            `UPDATE "order"
                SET relay_email_status = ?,
                    relay_email_sent_at = CASE WHEN ? = 1 THEN datetime('now') ELSE relay_email_sent_at END
              WHERE id = ?`,
          )
          .bind(sent ? "sent" : "failed", sent ? 1 : 0, orderId),
      );
    }
    statements.push(
      db
        .prepare(
          `UPDATE "order"
              SET relay_synced_at = CASE
                WHEN relay_sheet_status = 'sent' AND relay_email_status = 'sent'
                  THEN COALESCE(relay_synced_at, datetime('now'))
                ELSE relay_synced_at
              END,
              relay_last_error = CASE WHEN ? = 1 THEN NULL ELSE 'Un canal del relé ha fallat' END
            WHERE id = ?`,
        )
        .bind(successful ? 1 : 0, orderId),
    );
    await db.batch(statements);
    return successful;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[relay] failed", { orderId, channels, message });
    await recordFailure(orderId, channels, message);
    return false;
  }
}
