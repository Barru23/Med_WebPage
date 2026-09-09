import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { syncOrderToRelay } from "@/lib/relay";
import { isFullRefund } from "@/lib/orders";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature"); if (!signature) return new NextResponse("Missing signature", { status: 400 });
  const rawBody = await req.text(); const { env } = await getCloudflareContext({ async: true }); const stripe = await getStripe(); let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider()); } catch { return new NextResponse("Invalid signature", { status: 400 }); }
  const db = await getDb();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO stripe_event (id, type) VALUES (?, ?)`).bind(event.id, event.type).run();
  if (!inserted.meta.changes) return NextResponse.json({ received: true, duplicate: true });
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await confirmOrderPaid(event.data.object as Stripe.Checkout.Session, req.nextUrl.origin);
    else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") await cancelOrder(event.data.object as Stripe.Checkout.Session);
    else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      // Stripe sends charge.refunded for a PARTIAL refund too. Voiding the order
      // there would kill a code the buyer is still entitled to use: giving someone
      // the booking fee back must not cost them the trip. Only a refund of the
      // whole charge cancels the order.
      if (isFullRefund(charge)) await voidOrder(charge.payment_intent);
    } else if (event.type === "charge.dispute.created") {
      // A dispute is not a refund — the money has not moved back yet — but the
      // code stops working immediately either way. Better an argument at the door
      // than a seat handed to someone who has already reversed the payment.
      await voidOrder((event.data.object as Stripe.Dispute).payment_intent);
    }
  } catch {
    // Do not permanently acknowledge an event that failed halfway through.
    await db.prepare(`DELETE FROM stripe_event WHERE id = ?`).bind(event.id).run();
    return new NextResponse("Webhook processing failed", { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function confirmOrderPaid(session: Stripe.Checkout.Session, origin: string) {
  const db = await getDb(); const orderId = session.metadata?.orderId;
  if (!orderId || session.currency?.toUpperCase() !== "EUR" || session.amount_total == null) return;
  const order = await db.prepare(`SELECT id, status, total_cents, currency FROM "order" WHERE id = ? AND stripe_session_id = ?`).bind(orderId, session.id).first<{ id: string; status: string; total_cents: number; currency: string }>();
  if (!order || order.status !== "pending" || order.currency !== "EUR" || order.total_cents !== session.amount_total) return;
  // Only the money says paid. A delayed-notification method sends
  // checkout.session.completed with payment_status "unpaid" and status
  // "complete"; that order is confirmed later by async_payment_succeeded.
  if (session.payment_status !== "paid") return;
  const { results: items } = await db.prepare(`SELECT variant_id, quantity FROM order_item WHERE order_id = ?`).bind(order.id).all<{ variant_id: string; quantity: number }>();
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
  await db.batch([
    db.prepare(`UPDATE "order" SET status = 'paid', paid_at = datetime('now'), stripe_payment_intent = ? WHERE id = ? AND status = 'pending'`).bind(pi, order.id),
    ...items.map((item) => db.prepare(`UPDATE variant SET sold = sold + ? WHERE id = ?`).bind(item.quantity, item.variant_id)),
    db.prepare(`UPDATE stock_reservation SET consumed_at = datetime('now') WHERE order_id = ? AND consumed_at IS NULL`).bind(order.id),
  ]);

  // The sheet row and the buyer's email go out after the payment is recorded,
  // and in the background: Stripe wants a fast acknowledgement, and Apps Script
  // is slow enough to risk a webhook timeout. A relay failure leaves
  // relay_synced_at NULL, which the Sales screen surfaces for a manual resync —
  // it never undoes the payment.
  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(syncOrderToRelay(order.id, origin));
}

async function cancelOrder(session: Stripe.Checkout.Session) {
  const db = await getDb(); const orderId = session.metadata?.orderId; if (!orderId) return;
  await db.batch([
    db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ? AND stripe_session_id = ? AND status = 'pending'`).bind(orderId, session.id),
    db.prepare(`UPDATE stock_reservation SET expires_at = datetime('now') WHERE order_id = ? AND consumed_at IS NULL`).bind(orderId),
  ]);
}

/**
 * Cancel a paid order and put its seats back on sale.
 *
 * Takes the payment intent rather than the Stripe object, because the two
 * events that call it carry different shapes — a Charge and a Dispute — and
 * only this field means the same thing in both.
 */
async function voidOrder(paymentIntent: string | Stripe.PaymentIntent | null | undefined) {
  const db = await getDb(); const pi = typeof paymentIntent === "string" ? paymentIntent : null; if (!pi) return;
  // Refunding has to give the seat back. `sold` was incremented on payment, so
  // leaving it alone would burn a unit of capacity per refund — 100 places with
  // 5 refunds would only ever sell 95. Guarded by status = 'paid' so a repeated
  // refund/dispute event cannot decrement twice.
  const order = await db.prepare(`SELECT id FROM "order" WHERE stripe_payment_intent = ? AND status = 'paid'`).bind(pi).first<{ id: string }>();
  if (!order) return;
  const { results: items } = await db.prepare(`SELECT variant_id, quantity FROM order_item WHERE order_id = ?`).bind(order.id).all<{ variant_id: string; quantity: number }>();
  await db.batch([
    db.prepare(`UPDATE "order" SET status = 'refunded' WHERE id = ? AND status = 'paid'`).bind(order.id),
    // MAX(...) keeps the CHECK (sold >= 0) safe if the counts ever disagree.
    ...items.map((item) => db.prepare(`UPDATE variant SET sold = MAX(sold - ?, 0) WHERE id = ?`).bind(item.quantity, item.variant_id)),
  ]);
}
