"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { newId, newTicketCode } from "@/lib/ids";
import { AVAIL_EXPR } from "@/lib/availability";
import type { Locale } from "@/lib/locales";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  return `${proto}://${host}`;
}

export type CheckoutState = { error?: string } | null;

interface CheckoutLine {
  variantId: string;
  quantity: number;
  answers: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function parseLines(json: string): CheckoutLine[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function uniqueTicketCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newTicketCode();
    const existing = await db
      .prepare(`SELECT 1 FROM order_item WHERE ticket_code = ?`)
      .bind(code)
      .first();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique ticket code");
}

export async function submitOrder(
  activitySlug: string,
  locale: Locale,
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const buyerName = str(formData.get("buyer_name"));
  const buyerEmail = str(formData.get("buyer_email"));
  const buyerPhone = str(formData.get("buyer_phone"));
  const lines = parseLines(String(formData.get("lines_json") ?? "[]")).filter(
    (l) => l.quantity > 0,
  );

  if (!buyerName || !buyerEmail) {
    return { error: "El nom i l'email són obligatoris." };
  }
  if (!EMAIL_RE.test(buyerEmail)) {
    return { error: "L'email no és vàlid." };
  }
  if (lines.length === 0) {
    return { error: "Selecciona almenys una modalitat." };
  }

  const db = await getDb();
  const activity = await db
    .prepare(`SELECT id, edition FROM activity WHERE slug = ? AND published = 1`)
    .bind(activitySlug)
    .first<{ id: string; edition: string | null }>();
  if (!activity) return { error: "Activitat no trobada." };

  const { results: fields } = await db
    .prepare(`SELECT id FROM field WHERE activity_id = ?`)
    .bind(activity.id)
    .all<{ id: string }>();
  const fieldIds = new Set(fields.map((f) => f.id));
  const requiredFields = await db
    .prepare(`SELECT id, label_ca FROM field WHERE activity_id = ? AND required = 1`)
    .bind(activity.id)
    .all<{ id: string; label_ca: string }>();

  let totalCents = 0;
  const resolvedLines: Array<{
    variantId: string;
    variantName: string;
    quantity: number;
    answers: Record<string, string>;
    priceCents: number;
  }> = [];

  for (const line of lines) {
    const variant = await db
      .prepare(
        `SELECT v.id, v.name_ca, v.price_cents, ${AVAIL_EXPR} AS avail
           FROM variant v WHERE v.id = ? AND v.activity_id = ?`,
      )
      .bind(line.variantId, activity.id)
      .first<{ id: string; name_ca: string; price_cents: number; avail: number }>();
    if (!variant) return { error: "Modalitat no vàlida." };
    if (line.quantity > variant.avail) {
      return { error: `No queden prou places de "${variant.name_ca}".` };
    }

    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(line.answers ?? {})) {
      if (fieldIds.has(key) && typeof value === "string") answers[key] = value;
    }
    for (const rf of requiredFields.results) {
      if (!answers[rf.id]?.trim()) {
        return { error: `Falta la resposta a "${rf.label_ca}".` };
      }
    }

    totalCents += variant.price_cents * line.quantity;
    resolvedLines.push({
      variantId: variant.id,
      variantName: variant.name_ca,
      quantity: line.quantity,
      answers,
      priceCents: variant.price_cents,
    });
  }

  const orderId = newId("ord");
  const paidNow = totalCents === 0; // a €0 variant skips Stripe entirely (§4b)

  // ticket_code is assigned now, at order creation, not at payment
  // confirmation — the buyer needs a durable URL to bookmark/check back on
  // before a Stripe payment (or admin manual confirmation) completes.
  const itemCodes: string[] = [];
  for (const line of resolvedLines) {
    itemCodes.push(await uniqueTicketCode(db));
  }
  const successPath =
    itemCodes.length === 1 ? `/${locale}/t/${itemCodes[0]}` : `/${locale}/o/${orderId}`;

  let stripeSessionId: string | null = null;
  let redirectUrl = successPath; // relative — used as-is for the €0 (no-Stripe) path

  if (!paidNow) {
    try {
      const stripe = await getStripe();
      const origin = await siteOrigin();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card", "bizum"],
        customer_email: buyerEmail,
        line_items: resolvedLines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency: "eur",
            unit_amount: line.priceCents,
            product_data: { name: line.variantName },
          },
        })),
        success_url: `${origin}${successPath}`,
        cancel_url: `${origin}/${locale}/a/${activitySlug}`,
        metadata: { orderId },
      });
      if (!session.url) return { error: "No s'ha pogut iniciar el pagament." };
      stripeSessionId = session.id;
      redirectUrl = session.url;
    } catch {
      return { error: "No s'ha pogut connectar amb Stripe. Torna-ho a provar." };
    }
  }

  const statements = [
    db
      .prepare(
        `INSERT INTO "order"
          (id, activity_id, edition, buyer_name, buyer_email, buyer_phone,
           total_cents, currency, status, payment_method, stripe_session_id,
           created_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, datetime('now'), ?)`,
      )
      .bind(
        orderId,
        activity.id,
        activity.edition,
        buyerName,
        buyerEmail,
        buyerPhone,
        totalCents,
        paidNow ? "paid" : "pending",
        paidNow ? "manual" : "stripe",
        stripeSessionId,
        paidNow ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
      ),
  ];

  resolvedLines.forEach((line, i) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO order_item (id, order_id, variant_id, quantity, field_answers_json, ticket_code)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("oi"),
          orderId,
          line.variantId,
          line.quantity,
          Object.keys(line.answers).length > 0 ? JSON.stringify(line.answers) : null,
          itemCodes[i],
        ),
    );
    if (paidNow) {
      statements.push(
        db
          .prepare(`UPDATE variant SET sold = sold + ? WHERE id = ?`)
          .bind(line.quantity, line.variantId),
      );
    }
  });

  await db.batch(statements);

  revalidatePath("/[locale]/a/[slug]", "page");
  revalidatePath("/[locale]/d/[slug]", "page");
  revalidatePath("/admin/activities");

  redirect(redirectUrl);
}
