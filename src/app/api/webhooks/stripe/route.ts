import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { syncOrderToRelay } from "@/lib/relay";
import { getStripe } from "@/lib/stripe";
import { isFullRefund } from "@/lib/orders";

const PROCESSING_TIMEOUT_MINUTES = 5;

function paymentIntentId(
  value: string | Stripe.PaymentIntent | null,
): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });

  const rawBody = await req.text();
  const { env } = await getCloudflareContext({ async: true });
  const stripe = await getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const db = await getDb();
  await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_event (
         id, type, processing_status, attempts
       ) VALUES (?, ?, 'received', 0)`,
    )
    .bind(event.id, event.type)
    .run();

  const claimed = await db
    .prepare(
      `UPDATE stripe_event
          SET processing_status = 'processing',
              attempts = attempts + 1,
              processing_started_at = datetime('now'),
              last_error = NULL
        WHERE id = ?
          AND (
            processing_status IN ('received', 'failed')
            OR (
              processing_status = 'processing'
              AND processing_started_at < datetime('now', ?)
            )
          )`,
    )
    .bind(event.id, `-${PROCESSING_TIMEOUT_MINUTES} minutes`)
    .run();

  if (!claimed.meta.changes) {
    const state = await db
      .prepare(`SELECT processing_status FROM stripe_event WHERE id = ?`)
      .bind(event.id)
      .first<{ processing_status: string }>();
    if (state?.processing_status === "processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Another request owns the event. Asking Stripe to retry is safer than
    // acknowledging work that may never finish.
    return new NextResponse("Webhook already processing", { status: 409 });
  }

  try {
    await processEvent(event, req.nextUrl.origin);
    await db
      .prepare(
        `UPDATE stripe_event
            SET processing_status = 'processed',
                processed_at = datetime('now'),
                last_error = NULL
          WHERE id = ?`,
      )
      .bind(event.id)
      .run();
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[stripe-webhook] processing failed", {
      eventId: event.id,
      type: event.type,
      message,
    });
    await db
      .prepare(
        `UPDATE stripe_event
            SET processing_status = 'failed', last_error = ?
          WHERE id = ?`,
      )
      .bind(message.slice(0, 1000), event.id)
      .run();
    return new NextResponse("Webhook processing failed", { status: 500 });
  }
}

async function processEvent(event: Stripe.Event, requestOrigin: string): Promise<void> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await confirmOrderPaid(event.data.object as Stripe.Checkout.Session, requestOrigin);
    return;
  }
  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    await cancelOrder(event.data.object as Stripe.Checkout.Session);
    return;
  }
  if (event.type === "charge.refunded") {
    await recordRefund(event.data.object as Stripe.Charge);
    return;
  }
  if (event.type === "charge.dispute.created") {
    await openDispute(event.data.object as Stripe.Dispute);
    return;
  }
  if (event.type === "charge.dispute.closed") {
    await closeDispute(event.data.object as Stripe.Dispute);
  }
}

async function confirmOrderPaid(
  session: Stripe.Checkout.Session,
  requestOrigin: string,
): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) throw new Error("Paid Checkout Session has no orderId metadata");
  if (session.currency?.toUpperCase() !== "EUR" || session.amount_total == null) {
    throw new Error("Paid Checkout Session has an invalid currency or amount");
  }

  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT id, status, total_cents, currency, stripe_session_id
         FROM "order" WHERE id = ?`,
    )
    .bind(orderId)
    .first<{
      id: string;
      status: string;
      total_cents: number;
      currency: string;
      stripe_session_id: string | null;
    }>();
  if (!order) throw new Error(`Order ${orderId} does not exist`);
  if (order.stripe_session_id !== session.id) {
    throw new Error(`Stripe session does not match order ${orderId}`);
  }
  if (order.currency !== "EUR" || order.total_cents !== session.amount_total) {
    throw new Error(`Stripe amount does not match order ${orderId}`);
  }
  if (session.payment_status !== "paid") return;
  if (order.status === "paid") return;
  if (order.status !== "pending") {
    throw new Error(`Captured payment targets order ${orderId} in state ${order.status}`);
  }

  const paymentIntent = paymentIntentId(session.payment_intent);
  if (!paymentIntent) throw new Error(`Paid order ${orderId} has no payment intent`);
  await db.batch([
    db
      .prepare(
        `UPDATE "order"
            SET status = 'paid', paid_at = datetime('now'),
                stripe_payment_intent = ?
          WHERE id = ? AND status = 'pending'`,
      )
      .bind(paymentIntent, order.id),
    db
      .prepare(
        `UPDATE stock_reservation SET consumed_at = datetime('now')
          WHERE order_id = ? AND consumed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM "order" o
               WHERE o.id = ? AND o.stripe_session_id = ?
                 AND o.status = 'paid'
            )`,
      )
      .bind(order.id, order.id, session.id),
  ]);

  const confirmed = await db
    .prepare(`SELECT status FROM "order" WHERE id = ?`)
    .bind(order.id)
    .first<{ status: string }>();
  if (confirmed?.status !== "paid") {
    throw new Error(`Captured payment could not transition order ${orderId} to paid`);
  }

  const { env } = await getCloudflareContext({ async: true });
  const origin = env.PUBLIC_BASE_URL?.trim()
    ? new URL(env.PUBLIC_BASE_URL).origin
    : requestOrigin;
  // Await the relay so its final channel states are persisted before the
  // request context closes. Apps Script remains idempotent if Stripe retries.
  await syncOrderToRelay(order.id, origin);
}

async function cancelOrder(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) throw new Error("Cancelled Checkout Session has no orderId metadata");
  const db = await getDb();
  const order = await db
    .prepare(`SELECT status, stripe_session_id FROM "order" WHERE id = ?`)
    .bind(orderId)
    .first<{ status: string; stripe_session_id: string | null }>();
  if (!order) throw new Error(`Cancelled session references unknown order ${orderId}`);
  if (order.stripe_session_id !== session.id) {
    throw new Error(`Cancelled Stripe session does not match order ${orderId}`);
  }
  if (order.status !== "pending") return;
  await db.batch([
    db
      .prepare(
        `UPDATE "order" SET status = 'cancelled'
          WHERE id = ? AND stripe_session_id = ? AND status = 'pending'`,
      )
      .bind(orderId, session.id),
    db
      .prepare(
        `UPDATE stock_reservation SET expires_at = datetime('now')
          WHERE order_id = ? AND consumed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM "order" o
               WHERE o.id = ? AND o.stripe_session_id = ?
                 AND o.status = 'cancelled'
            )`,
      )
      .bind(orderId, orderId, session.id),
  ]);
}

async function recordRefund(charge: Stripe.Charge): Promise<void> {
  const paymentIntent = paymentIntentId(charge.payment_intent);
  if (!paymentIntent) throw new Error("Refunded charge has no payment intent");
  const db = await getDb();
  const fullRefund = isFullRefund(charge);
  const updated = await db
    .prepare(
      `UPDATE "order"
          SET refunded_cents = MAX(refunded_cents, ?),
              status = CASE WHEN ? = 1 THEN 'refunded' ELSE status END,
              dispute_status = CASE
                WHEN ? = 1 AND dispute_status = 'open' THEN 'lost'
                ELSE dispute_status
              END
        WHERE stripe_payment_intent = ? AND status IN ('paid', 'refunded')`,
    )
    .bind(charge.amount_refunded, fullRefund ? 1 : 0, fullRefund ? 1 : 0, paymentIntent)
    .run();
  if (!updated.meta.changes) {
    const existing = await db
      .prepare(`SELECT id FROM "order" WHERE stripe_payment_intent = ?`)
      .bind(paymentIntent)
      .first();
    if (!existing) throw new Error("Refund references an unknown payment intent");
  }
}

async function openDispute(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntent = paymentIntentId(dispute.payment_intent);
  if (!paymentIntent) throw new Error("Dispute has no payment intent");
  const db = await getDb();
  const updated = await db
    .prepare(
      `UPDATE "order"
          SET dispute_status = 'open', disputed_at = datetime('now')
        WHERE stripe_payment_intent = ? AND status = 'paid'`,
    )
    .bind(paymentIntent)
    .run();
  if (!updated.meta.changes) {
    const existing = await db
      .prepare(`SELECT id FROM "order" WHERE stripe_payment_intent = ?`)
      .bind(paymentIntent)
      .first();
    if (!existing) throw new Error("Dispute references an unknown payment intent");
  }
}

async function closeDispute(dispute: Stripe.Dispute): Promise<void> {
  const paymentIntent = paymentIntentId(dispute.payment_intent);
  if (!paymentIntent) throw new Error("Closed dispute has no payment intent");
  const won = dispute.status === "won";
  const lost = dispute.status === "lost";
  if (!won && !lost) throw new Error(`Unsupported closed dispute status ${dispute.status}`);
  const db = await getDb();
  const updated = await db
    .prepare(
      `UPDATE "order"
          SET dispute_status = ?,
              status = CASE WHEN ? = 1 THEN 'refunded' ELSE status END,
              refunded_cents = CASE WHEN ? = 1 THEN total_cents ELSE refunded_cents END
        WHERE stripe_payment_intent = ? AND dispute_status = 'open'`,
    )
    .bind(won ? "won" : "lost", lost ? 1 : 0, lost ? 1 : 0, paymentIntent)
    .run();
  if (!updated.meta.changes) {
    const existing = await db
      .prepare(`SELECT id FROM "order" WHERE stripe_payment_intent = ?`)
      .bind(paymentIntent)
      .first();
    if (!existing) throw new Error("Closed dispute references an unknown payment intent");
  }
}
