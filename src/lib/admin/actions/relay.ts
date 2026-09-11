"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { syncOrderToRelay, type RelayChannel } from "@/lib/relay";

/**
 * Resend one paid order to the Apps Script relay — the sheet row and the
 * buyer's email. Safe to press repeatedly: the script is idempotent on
 * order_id, so a second attempt cannot double a row.
 *
 * This is the answer to requisits-produccio.md §7's "què fer si Google Sheets
 * no rep una comanda": press the button, not a developer request.
 */
export async function resyncOrder(orderId: string, channel: RelayChannel): Promise<void> {
  await requireAdmin();

  const db = await getDb();
  const order = await db
    .prepare(`SELECT id FROM "order" WHERE id = ? AND status = 'paid'`)
    .bind(orderId)
    .first<{ id: string }>();
  if (!order) return;

  const h = await headers();
  const { env } = await getCloudflareContext({ async: true });
  const origin = env.PUBLIC_BASE_URL?.trim() ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  await syncOrderToRelay(orderId, new URL(origin).origin, [channel]);

  revalidatePath("/admin/sales/[slug]", "page");
}
