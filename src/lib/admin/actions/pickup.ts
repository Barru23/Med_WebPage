"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function markCollected(orderItemId: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db
    .prepare(
      `UPDATE order_item
          SET collected_at = datetime('now')
        WHERE id = ? AND collected_at IS NULL
          AND EXISTS (
            SELECT 1 FROM "order" o
            JOIN activity a ON a.id = o.activity_id
            WHERE o.id = order_item.order_id
              AND o.status = 'paid' AND a.type = 'merch'
          )`,
    )
    .bind(orderItemId)
    .run();
  revalidatePath("/admin/pickup");
}

export async function undoCollected(orderItemId: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db
    .prepare(`UPDATE order_item SET collected_at = NULL WHERE id = ? AND collected_at IS NOT NULL`)
    .bind(orderItemId)
    .run();
  revalidatePath("/admin/pickup");
}
