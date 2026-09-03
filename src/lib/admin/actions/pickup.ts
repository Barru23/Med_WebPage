"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

export async function toggleCollected(orderItemId: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE order_item
          SET collected_at = CASE WHEN collected_at IS NULL THEN datetime('now') ELSE NULL END
        WHERE id = ?`,
    )
    .bind(orderItemId)
    .run();
  revalidatePath("/admin/pickup");
}
