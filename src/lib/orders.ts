// Order-line arithmetic, kept apart from the checkout action so it can be
// tested without the Next/Cloudflare runtime around it. Both bugs this
// replaced lived here: reserving per line violated the UNIQUE index on
// stock_reservation(order_id, variant_id), and checking availability per line
// let two lines of one seat through when only one seat was left.

export interface OrderLine {
  variantId: string;
  quantity: number;
}

/**
 * Total quantity requested per variant across every line of one order.
 *
 * A trip bought for two friends is two `order_item` rows naming the same
 * variant; the buyer still needs two seats of it, and the database still wants
 * exactly one reservation row for it.
 */
export function aggregateByVariant(lines: readonly OrderLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * Units one order may take when the admin leaves "Màxim per compra" blank.
 *
 * Blank used to mean "no limit", which let a single request hold up to the
 * hard ceiling below for the whole life of a Stripe session. Ten covers a
 * group of friends; an activity that genuinely needs more sets it explicitly.
 */
export const DEFAULT_MAX_PER_ORDER = 10;

/** Absolute ceiling on units per order, whatever an activity is set to. */
export const MAX_UNITS_PER_ORDER = 100;

/** The cap that actually applies to one order, given the edition's setting. */
export function effectiveMaxPerOrder(limit: number | null | undefined): number {
  const configured = limit && limit > 0 ? limit : DEFAULT_MAX_PER_ORDER;
  return Math.min(configured, MAX_UNITS_PER_ORDER);
}

/** Units across the whole order, for the per-buyer cap on an Activity. */
export function totalUnits(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Whether a Stripe charge has been refunded in full.
 *
 * `charge.refunded` fires for a PARTIAL refund too, and the handler it feeds
 * cancels the order and puts every seat back on sale. Giving somebody the
 * booking fee back must not cost them the trip, so the amounts decide, not the
 * event name.
 */
export function isFullRefund(charge: { amount: number; amount_refunded: number }): boolean {
  return charge.amount_refunded >= charge.amount;
}
