import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";

/**
 * The Apps Script relay (CLAUDE.md §3): one call, owned by the shared Google
 * account, that appends the sheet rows AND emails the buyer their codes.
 *
 * Two rules govern everything here:
 *
 *  - D1 is the source of truth. A relay that is down, slow, or out of Gmail
 *    quota must never undo a confirmed payment, so every failure is swallowed
 *    and recorded rather than thrown.
 *  - The sheet is a copy. It carries `order_id` so a Stripe retry cannot double
 *    a row, and the script is the side that enforces that.
 */

export interface RelayItem {
  ticket_code: string;
  item: string;
  quantity: number;
  unit_price_eur: number;
  answers: Record<string, string>;
}

export interface RelayPayload {
  secret: string;
  order_id: string;
  paid_at: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  activity: string;
  edition: string;
  /** The activity's custom questions, in the order the admin arranged them.
   *  The script turns these into real columns on that activity's tab, so a
   *  trip's DNI and allergies can be sorted and filtered instead of living
   *  squashed inside one cell. */
  field_labels: string[];
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
  edition: string | null;
  payment_method: string;
  total_cents: number;
  activity_title: string;
}

interface ItemRow {
  ticket_code: string;
  quantity: number;
  unit_price_cents: number | null;
  variant_name: string;
  field_answers_json: string | null;
}

/**
 * Gather everything the sheet and the email need for one order. Field answers
 * are resolved to their labels here rather than in the script: the script must
 * not have to know how this database is shaped.
 */
export async function buildRelayPayload(
  orderId: string,
  origin: string,
): Promise<RelayPayload | null> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.SHEETS_RELAY_SECRET;
  if (!secret) return null;

  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT o.id, o.paid_at, o.buyer_name, o.buyer_email, o.buyer_phone,
              o.edition, o.payment_method, o.total_cents,
              a.title_ca AS activity_title
         FROM "order" o JOIN activity a ON a.id = o.activity_id
        WHERE o.id = ?`,
    )
    .bind(orderId)
    .first<OrderRow>();
  if (!order) return null;

  const [{ results: items }, { results: fields }] = await Promise.all([
    db
      .prepare(
        `SELECT oi.ticket_code, oi.quantity, oi.unit_price_cents,
                COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name,
                oi.field_answers_json
           FROM order_item oi JOIN variant v ON v.id = oi.variant_id
          WHERE oi.order_id = ?`,
      )
      .bind(orderId)
      .all<ItemRow>(),
    db
      .prepare(
        `SELECT f.id, f.label_ca FROM field f
           JOIN activity a ON a.id = f.activity_id
           JOIN "order" o ON o.activity_id = a.id
          WHERE o.id = ? ORDER BY f.position`,
      )
      .bind(orderId)
      .all<{ id: string; label_ca: string }>(),
  ]);

  const labelOf = new Map(fields.map((f) => [f.id, f.label_ca]));

  return {
    secret,
    order_id: order.id,
    paid_at: order.paid_at ?? "",
    buyer_name: order.buyer_name,
    buyer_email: order.buyer_email,
    buyer_phone: order.buyer_phone ?? "",
    activity: order.activity_title,
    edition: order.edition ?? "",
    field_labels: fields.map((f) => f.label_ca),
    payment_method: order.payment_method,
    total_eur: order.total_cents / 100,
    ticket_url_base: `${origin}/ca/t/`,
    items: items.map((item) => {
      const answers: Record<string, string> = {};
      if (item.field_answers_json) {
        try {
          for (const [id, value] of Object.entries(
            JSON.parse(item.field_answers_json) as Record<string, string>,
          )) {
            answers[labelOf.get(id) ?? id] = value;
          }
        } catch {
          // A malformed answers blob is not worth losing the row over.
        }
      }
      return {
        ticket_code: item.ticket_code,
        item: item.variant_name,
        quantity: item.quantity,
        unit_price_eur: (item.unit_price_cents ?? 0) / 100,
        answers,
      };
    }),
  };
}

/**
 * Send one paid order to the relay and record the result. Returns whether the
 * relay accepted it; never throws.
 */
export async function syncOrderToRelay(orderId: string, origin: string): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const url = env.SHEETS_RELAY_URL;
    if (!url) return false;

    const payload = await buildRelayPayload(orderId, origin);
    if (!payload) return false;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Apps Script answers a web app deployment with a redirect to
      // script.googleusercontent.com; without following it the POST looks like
      // a failure even when the row was written.
      redirect: "follow",
    });
    const body = await res.text();
    if (!res.ok || !body.includes('"ok":true')) {
      console.error("[relay] rejected", { orderId, status: res.status, body: body.slice(0, 300) });
      return false;
    }

    const db = await getDb();
    await db
      .prepare(`UPDATE "order" SET relay_synced_at = datetime('now') WHERE id = ?`)
      .bind(orderId)
      .run();
    return true;
  } catch (err) {
    console.error("[relay] failed", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
