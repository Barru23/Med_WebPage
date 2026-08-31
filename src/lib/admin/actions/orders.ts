"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

/** Admin marks a manual (non-Stripe) order as paid — CLAUDE.md §11 step 5. */
export async function markOrderPaid(orderId: string): Promise<void> {
  const db = await getDb();
  const order = await db
    .prepare(`SELECT id, status FROM "order" WHERE id = ? AND payment_method = 'manual'`)
    .bind(orderId)
    .first<{ id: string; status: string }>();
  if (!order || order.status !== "pending") return;

  const { results: items } = await db
    .prepare(`SELECT variant_id, quantity FROM order_item WHERE order_id = ?`)
    .bind(orderId)
    .all<{ variant_id: string; quantity: number }>();

  await db.batch([
    db
      .prepare(`UPDATE "order" SET status = 'paid', paid_at = datetime('now') WHERE id = ?`)
      .bind(orderId),
    ...items.map((item) =>
      db
        .prepare(`UPDATE variant SET sold = sold + ? WHERE id = ?`)
        .bind(item.quantity, item.variant_id),
    ),
  ]);

  revalidatePath("/admin/sales/[slug]", "page");
  revalidatePath("/admin/activities");
}
