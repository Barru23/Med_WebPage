"use server";

import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findTicket } from "@/lib/admin/queries";

export type CheckInResult =
  | { ok: true; already: boolean; activity: string; variant: string; buyer: string; quantity: number }
  | { ok: false; reason: "not_found" | "not_paid" | "disputed" };

export async function checkIn(rawCode: string): Promise<CheckInResult> {
  await requireAdmin();
  const code = rawCode.trim().toUpperCase();
  const db = await getDb();
  const checkedIn = await db
    .prepare(
      `UPDATE order_item
          SET checked_in_at = datetime('now')
        WHERE ticket_code = ? AND checked_in_at IS NULL
          AND EXISTS (
            SELECT 1 FROM "order" o
             WHERE o.id = order_item.order_id
               AND o.status = 'paid' AND o.dispute_status != 'open'
          )`,
    )
    .bind(code)
    .run();
  const ticket = await findTicket(code);
  if (!ticket) return { ok: false, reason: "not_found" };
  if (ticket.order_status !== "paid") return { ok: false, reason: "not_paid" };
  if (ticket.dispute_status === "open") return { ok: false, reason: "disputed" };

  return {
    ok: true,
    already: checkedIn.meta.changes === 0,
    activity: ticket.activity_title,
    variant: ticket.variant_name,
    buyer: ticket.buyer_name,
    quantity: ticket.quantity,
  };
}
