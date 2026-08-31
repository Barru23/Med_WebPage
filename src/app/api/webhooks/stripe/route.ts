import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";

// CLAUDE.md §6: "Never trust the redirect to confirm payment. The webhook is
// the only authority. Verify the Stripe signature. Make the handler
// idempotent — Stripe retries."
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });

  const rawBody = await req.text();
  const { env } = await getCloudflareContext({ async: true });
  const stripe = await getStripe();

  let event: Stripe.Event;
  try {
    // Async + Web Crypto variant — Workers has no Node crypto for the sync path.
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") await confirmOrderPaid(session);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      await confirmOrderPaid(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "checkout.session.async_payment_failed": {
      await cancelOrder(event.data.object as Stripe.Checkout.Session);
      break;
    }
    default:
      break; // acknowledge everything else so Stripe stops retrying it
  }

  return NextResponse.json({ received: true });
}

async function confirmOrderPaid(session: Stripe.Checkout.Session): Promise<void> {
  const db = await getDb();
  const order = await db
    .prepare(`SELECT id, status FROM "order" WHERE stripe_session_id = ?`)
    .bind(session.id)
    .first<{ id: string; status: string }>();
  if (!order || order.status !== "pending") return; // unknown or already handled — idempotent

  const { results: items } = await db
    .prepare(`SELECT variant_id, quantity FROM order_item WHERE order_id = ?`)
    .bind(order.id)
    .all<{ variant_id: string; quantity: number }>();

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  await db.batch([
    db
      .prepare(
        `UPDATE "order" SET status = 'paid', paid_at = datetime('now'), stripe_payment_intent = ?
         WHERE id = ?`,
      )
      .bind(paymentIntent, order.id),
    ...items.map((item) =>
      db
        .prepare(`UPDATE variant SET sold = sold + ? WHERE id = ?`)
        .bind(item.quantity, item.variant_id),
    ),
  ]);
}

async function cancelOrder(session: Stripe.Checkout.Session): Promise<void> {
  const db = await getDb();
  await db
    .prepare(`UPDATE "order" SET status = 'cancelled' WHERE stripe_session_id = ? AND status = 'pending'`)
    .bind(session.id)
    .run();
}
