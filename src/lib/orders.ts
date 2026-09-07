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
