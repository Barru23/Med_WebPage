"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { AVAIL_EXPR } from "@/lib/availability";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { aggregateByVariant } from "@/lib/orders";
import { syncOrderToRelay } from "@/lib/relay";
import { utcNow } from "@/lib/time";

/** Mark a manual order paid after atomically reserving every requested unit. */
export async function markOrderPaid(orderId: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT id, status, activity_edition_id
         FROM "order"
        WHERE id = ? AND payment_method = 'manual'`,
    )
    .bind(orderId)
    .first<{ id: string; status: string; activity_edition_id: string | null }>();
  if (!order || order.status !== "pending") return;

  const { results: items } = await db
    .prepare(`SELECT variant_id AS variantId, quantity FROM order_item WHERE order_id = ?`)
    .bind(orderId)
    .all<{ variantId: string; quantity: number }>();
  const wanted = aggregateByVariant(items);
  if (wanted.size === 0) {
    throw new Error("La comanda no conté cap línia reservable.");
  }
  const expiresAt = utcNow(15 * 60 * 1000);

  await db.batch([
    db
      .prepare(
        `DELETE FROM stock_reservation
          WHERE order_id = ? AND consumed_at IS NULL
            AND expires_at <= datetime('now')`,
      )
      .bind(orderId),
    ...[...wanted].map(([variantId, quantity]) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO stock_reservation (
             id, order_id, variant_id, quantity, expires_at
           )
           SELECT ?, ?, v.id, ?, ?
             FROM variant v
            WHERE v.id = ?
              AND (v.edition_id = ? OR ? IS NULL)
              AND ${AVAIL_EXPR} >= ?`,
        )
        .bind(
          newId("res"),
          orderId,
          quantity,
          expiresAt,
          variantId,
          order.activity_edition_id,
          order.activity_edition_id,
          quantity,
        ),
    ),
  ]);

  const reservations = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM stock_reservation
        WHERE order_id = ? AND consumed_at IS NULL
          AND expires_at > datetime('now')`,
    )
    .bind(orderId)
    .first<{ count: number }>();
  if ((reservations?.count ?? 0) !== wanted.size) {
    await db
      .prepare(
        `UPDATE stock_reservation SET expires_at = datetime('now')
          WHERE order_id = ? AND consumed_at IS NULL`,
      )
      .bind(orderId)
      .run();
    throw new Error("No hi ha prou estoc per marcar aquesta comanda com a pagada.");
  }

  await db.batch([
    db
      .prepare(
        `UPDATE "order" SET status = 'paid', paid_at = datetime('now')
          WHERE id = ? AND status = 'pending'`,
      )
      .bind(orderId),
    db
      .prepare(
        `UPDATE stock_reservation SET consumed_at = datetime('now')
          WHERE order_id = ? AND consumed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM "order" o WHERE o.id = ? AND o.status = 'paid'
            )`,
      )
      .bind(orderId, orderId),
  ]);

  const paid = await db
    .prepare(`SELECT 1 FROM "order" WHERE id = ? AND status = 'paid'`)
    .bind(orderId)
    .first();
  if (!paid) throw new Error("La comanda ja no estava pendent i no s'ha modificat.");

  const { env } = await getCloudflareContext({ async: true });
  const origin = env.PUBLIC_BASE_URL?.trim()
    ? new URL(env.PUBLIC_BASE_URL).origin
    : "https://xivarri.invalid";
  await syncOrderToRelay(orderId, origin);

  revalidatePath("/admin/sales/[slug]", "page");
  revalidatePath("/admin/activities");
}
