"use server";

import { getDb } from "@/lib/db";
import { findTicket } from "@/lib/admin/queries";

export type CheckInResult =
  | { ok: true; already: boolean; activity: string; variant: string; buyer: string; quantity: number }
  | { ok: false; reason: "not_found" | "not_paid" };

export async function checkIn(rawCode: string): Promise<CheckInResult> {
  const ticket = await findTicket(rawCode);
  if (!ticket) return { ok: false, reason: "not_found" };
  if (ticket.order_status !== "paid") return { ok: false, reason: "not_paid" };

  const already = ticket.checked_in_at !== null;
  if (!already) {
    const db = await getDb();
    await db
      .prepare(`UPDATE order_item SET checked_in_at = datetime('now') WHERE id = ? AND checked_in_at IS NULL`)
      .bind(ticket.order_item_id)
      .run();
  }

  return {
    ok: true,
    already,
    activity: ticket.activity_title,
    variant: ticket.variant_name,
    buyer: ticket.buyer_name,
    quantity: ticket.quantity,
  };
}
