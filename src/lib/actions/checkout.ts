"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { newId, newTicketCode } from "@/lib/ids";
import { AVAIL_EXPR, ON_SALE_EXPR } from "@/lib/availability";
import { utcNow } from "@/lib/time";
import { aggregateByVariant, totalUnits } from "@/lib/orders";
import type { Locale } from "@/lib/locales";

async function siteOrigin() { const h = await headers(); return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`; }

// How long a seat is held while the buyer is inside Stripe Checkout.
//
// CLAUDE.md §4 says fifteen minutes, but Stripe refuses to create a Checkout
// Session that expires sooner than thirty ("It can be anywhere from 30 minutes
// to 24 hours after Checkout Session creation"), so fifteen is not available to
// us. The hold and the session must expire together: a shorter hold would
// release the seat while the buyer can still pay for it, and the webhook would
// then confirm an order for stock somebody else had already bought.
const HOLD_MS = 30 * 60 * 1000;
export type CheckoutState = { error?: string } | null;
interface CheckoutLine { variantId: string; quantity: number; answers: Record<string, string> }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function str(v: FormDataEntryValue | null) { const s = typeof v === "string" ? v.trim() : ""; return s || null; }
function parseLines(json: string): CheckoutLine[] { try { const p = JSON.parse(json); return Array.isArray(p) ? p : []; } catch { return []; } }
async function uniqueTicketCode(db: D1Database) { for (let i = 0; i < 5; i++) { const code = newTicketCode(); if (!(await db.prepare(`SELECT 1 FROM order_item WHERE ticket_code = ?`).bind(code).first())) return code; } throw new Error("Could not generate a unique ticket code"); }

export async function submitOrder(activitySlug: string, locale: Locale, _prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const buyerName = str(formData.get("buyer_name")); const buyerEmail = str(formData.get("buyer_email")); const buyerPhone = str(formData.get("buyer_phone"));
  const lines = parseLines(String(formData.get("lines_json") ?? "[]")).filter((l) => Number.isInteger(l.quantity) && l.quantity > 0);
  if (!buyerName || !buyerEmail) return { error: "El nom i l'email són obligatoris." }; if (!EMAIL_RE.test(buyerEmail)) return { error: "L'email no és vàlid." }; if (!lines.length) return { error: "Selecciona almenys una modalitat." };
  const db = await getDb(); const activity = await db.prepare(`SELECT id, edition, max_per_order, catalog_revision FROM activity WHERE slug = ? AND published = 1 AND archived = 0`).bind(activitySlug).first<{ id: string; edition: string | null; max_per_order: number | null; catalog_revision: number }>(); if (!activity) return { error: "Aquesta activitat no està disponible." };
  // The cap is enforced here, not only in the form: the line payload is a
  // hidden field and anyone can edit it before posting.
  if (activity.max_per_order && totalUnits(lines) > activity.max_per_order) return { error: `Màxim ${activity.max_per_order} unitats per comanda.` };
  const { results: fields } = await db.prepare(`SELECT id FROM field WHERE activity_id = ?`).bind(activity.id).all<{ id: string }>(); const fieldIds = new Set(fields.map((f) => f.id));
  const { results: requiredFields } = await db.prepare(`SELECT id, label_ca FROM field WHERE activity_id = ? AND required = 1`).bind(activity.id).all<{ id: string; label_ca: string }>();

  // Several lines can name the same variant — a trip bought for two friends is
  // two order_item rows of "amb bus". So availability is checked against the
  // TOTAL per variant (two lines of 1 must not both pass when 1 is left), and
  // stock_reservation, which is UNIQUE on (order_id, variant_id), gets one row
  // per variant rather than one per line.
  const wanted = aggregateByVariant(lines);
  const variants = new Map<string, { id: string; name_ca: string; price_cents: number }>();
  for (const [variantId, quantity] of wanted) {
    const v = await db.prepare(`SELECT v.id, v.name_ca, v.price_cents, ${AVAIL_EXPR} AS avail FROM variant v WHERE v.id = ? AND v.activity_id = ? AND ${ON_SALE_EXPR}`).bind(variantId, activity.id).first<{ id: string; name_ca: string; price_cents: number; avail: number }>();
    if (!v) return { error: "Modalitat no vàlida." };
    if (quantity > v.avail) return { error: `No queden prou places de "${v.name_ca}".` };
    variants.set(v.id, { id: v.id, name_ca: v.name_ca, price_cents: v.price_cents });
  }

  const resolved: Array<{ variantId: string; variantName: string; quantity: number; answers: Record<string, string>; priceCents: number }> = []; let total = 0;
  for (const line of lines) {
    const v = variants.get(line.variantId); if (!v) return { error: "Modalitat no vàlida." };
    const answers: Record<string, string> = {}; for (const [key, value] of Object.entries(line.answers ?? {})) if (fieldIds.has(key) && typeof value === "string") answers[key] = value;
    for (const f of requiredFields) if (!answers[f.id]?.trim()) return { error: `Falta la resposta a "${f.label_ca}".` };
    total += v.price_cents * line.quantity; resolved.push({ variantId: v.id, variantName: v.name_ca, quantity: line.quantity, answers, priceCents: v.price_cents });
  }
  const orderId = newId("ord"); const paidNow = total === 0; const codes = await Promise.all(resolved.map(() => uniqueTicketCode(db))); const expiresAt = utcNow(HOLD_MS);
  const statements = [db.prepare(`INSERT INTO "order" (id, activity_id, edition, buyer_name, buyer_email, buyer_phone, total_cents, currency, status, payment_method, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, datetime('now'), ?)`).bind(orderId, activity.id, activity.edition, buyerName, buyerEmail, buyerPhone, total, paidNow ? "paid" : "pending", paidNow ? "manual" : "stripe", paidNow ? utcNow() : null)];
  resolved.forEach((line, i) => statements.push(db.prepare(`INSERT INTO order_item (id, order_id, variant_id, quantity, field_answers_json, ticket_code, variant_name_snapshot, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId("oi"), orderId, line.variantId, line.quantity, Object.keys(line.answers).length ? JSON.stringify(line.answers) : null, codes[i], line.variantName, line.priceCents)));
  for (const [variantId, quantity] of wanted) {
    if (paidNow) statements.push(db.prepare(`UPDATE variant SET sold = sold + ? WHERE id = ?`).bind(quantity, variantId));
    else statements.push(db.prepare(`INSERT INTO stock_reservation (id, order_id, variant_id, quantity, expires_at) SELECT ?, ?, v.id, ?, ? FROM variant v WHERE v.id = ? AND ${ON_SALE_EXPR} AND v.stock - v.sold - (SELECT COALESCE(SUM(sr.quantity), 0) FROM stock_reservation sr WHERE sr.variant_id = v.id AND sr.consumed_at IS NULL AND sr.expires_at > datetime('now')) >= ?`).bind(newId("res"), orderId, quantity, expiresAt, variantId, quantity));
  }
  await db.batch(statements);
  if (!paidNow) { const r = await db.prepare(`SELECT COUNT(*) AS count FROM stock_reservation WHERE order_id = ?`).bind(orderId).first<{ count: number }>(); if ((r?.count ?? 0) !== wanted.size) { await db.batch([
    db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ?`).bind(orderId),
    db.prepare(`UPDATE stock_reservation SET expires_at = datetime('now') WHERE order_id = ? AND consumed_at IS NULL`).bind(orderId),
  ]); return { error: "No queden prou unitats disponibles. Torna-ho a provar." }; } }
  let destination = codes.length === 1 ? `/${locale}/t/${codes[0]}` : `/${locale}/o/${orderId}`;
  if (!paidNow) { try { const stripe = await getStripe(); const origin = await siteOrigin(); const session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card", "bizum"], customer_email: buyerEmail, line_items: resolved.map((line) => ({ quantity: line.quantity, price_data: { currency: "eur", unit_amount: line.priceCents, product_data: { name: line.variantName } } })), success_url: `${origin}${destination}`, cancel_url: `${origin}/${locale}/a/${activitySlug}`, metadata: { orderId }, expires_at: Math.floor((Date.now() + HOLD_MS) / 1000) }); if (!session.url) throw new Error("Missing Stripe URL"); await db.prepare(`UPDATE "order" SET stripe_session_id = ? WHERE id = ? AND status = 'pending'`).bind(session.id, orderId).run();
    // An admin edit may race with session creation before stripe_session_id is
    // visible to the admin action. The revision check makes that new session
    // invalidate itself instead of exposing a stale price or sale window.
    const catalogStillCurrent = await db.prepare(`SELECT 1 FROM activity WHERE id = ? AND catalog_revision = ? AND published = 1 AND archived = 0`).bind(activity.id, activity.catalog_revision).first();
    if (!catalogStillCurrent) {
      await stripe.checkout.sessions.expire(session.id);
      await db.batch([
        db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).bind(orderId),
        db.prepare(`UPDATE stock_reservation SET expires_at = datetime('now') WHERE order_id = ? AND consumed_at IS NULL`).bind(orderId),
      ]);
      return { error: "L'activitat acaba de canviar. Revisa les dades i torna-ho a provar." };
    }
    destination = session.url; } catch (err) {
    // The buyer gets one calm sentence; the reason goes to the Worker log,
    // where whoever is on call can actually read it. Stripe's messages name
    // the offending field ("expires_at", an unavailable payment method), which
    // is the difference between a five-minute fix and an afternoon.
    console.error("[checkout] Stripe session failed", { orderId, message: err instanceof Error ? err.message : String(err) });
    await db.batch([
      db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).bind(orderId),
      db.prepare(`UPDATE stock_reservation SET expires_at = datetime('now') WHERE order_id = ? AND consumed_at IS NULL`).bind(orderId),
    ]);
    return { error: "No s'ha pogut connectar amb Stripe. Torna-ho a provar." };
  } }
  revalidatePath("/[locale]/a/[slug]", "page"); revalidatePath("/[locale]/d/[slug]", "page"); revalidatePath("/admin/activities"); redirect(destination);
}
