"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { syncOrderToRelay } from "@/lib/relay";
import { getStripe } from "@/lib/stripe";

export async function reconcilePendingOrder(orderId: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT id, status, stripe_session_id, total_cents, currency
         FROM "order" WHERE id = ? AND status = 'pending'`,
    )
    .bind(orderId)
    .first<{
      id: string;
      status: string;
      stripe_session_id: string | null;
      total_cents: number;
      currency: string;
    }>();
  if (!order?.stripe_session_id) return;

  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
  if (session.status === "expired") {
    await db.batch([
      db
        .prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
        .bind(order.id),
      db
        .prepare(
          `UPDATE stock_reservation SET expires_at = datetime('now')
            WHERE order_id = ? AND consumed_at IS NULL
              AND EXISTS (
                SELECT 1 FROM "order" o WHERE o.id = ? AND o.status = 'cancelled'
              )`,
        )
        .bind(order.id, order.id),
    ]);
  } else if (session.payment_status === "paid") {
    if (
      session.amount_total !== order.total_cents ||
      session.currency?.toUpperCase() !== order.currency
    ) {
      throw new Error("L'import o la moneda de Stripe no coincideixen amb la comanda.");
    }
    const paymentIntent = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    if (!paymentIntent) {
      throw new Error("La sessió pagada no té cap PaymentIntent associat.");
    }
    await db.batch([
      db
        .prepare(
          `UPDATE "order"
              SET status = 'paid', paid_at = datetime('now'), stripe_payment_intent = ?
            WHERE id = ? AND status = 'pending'`,
        )
        .bind(paymentIntent, order.id),
      db
        .prepare(
          `UPDATE stock_reservation SET consumed_at = datetime('now')
            WHERE order_id = ? AND consumed_at IS NULL
              AND EXISTS (
                SELECT 1 FROM "order" o WHERE o.id = ? AND o.status = 'paid'
              )`,
        )
        .bind(order.id, order.id),
    ]);
    const paid = await db
      .prepare(`SELECT 1 FROM "order" WHERE id = ? AND status = 'paid'`)
      .bind(order.id)
      .first();
    if (!paid) throw new Error("La comanda ha canviat d'estat durant la reconciliació.");
    const { env } = await getCloudflareContext({ async: true });
    const origin = env.PUBLIC_BASE_URL?.trim() || "https://xivarri.invalid";
    await syncOrderToRelay(order.id, new URL(origin).origin);
  }
  revalidatePath("/admin/operations");
}
