// Shared "how many of this variant are actually free right now" logic.
//
// CLAUDE.md §4: stock is decremented on confirmed payment, not on checkout
// start; inventory is held while a Stripe session is open, then released. We
// never mutate stock/sold for a hold — sold only moves on confirmed payment —
// so the hold is read from each reservation's own expires_at. It releases
// itself the moment that timestamp passes, with no cleanup job required.
//
// The window is HOLD_MS in src/lib/actions/checkout.ts and is thirty minutes,
// not the fifteen §4 asks for: Stripe will not create a Checkout Session that
// expires any sooner.
//
// Every query using this must alias the variant table as `v`.
export const HELD_BY_STRIPE = `(
  SELECT COALESCE(SUM(sr.quantity), 0)
    FROM stock_reservation sr
   WHERE sr.variant_id = v.id AND sr.consumed_at IS NULL
     AND sr.expires_at > datetime('now')
)`;

/** SQL expression for a variant's true remaining count. Requires alias `v`. */
export const AVAIL_EXPR = `MAX(v.stock - v.sold - ${HELD_BY_STRIPE}, 0)`;

/** Whether a variant may be bought at this instant. Requires alias `v`. */
export const ON_SALE_EXPR = `(
  v.active = 1
  AND (v.sale_start IS NULL OR v.sale_start <= datetime('now'))
  AND (v.sale_end IS NULL OR v.sale_end >= datetime('now'))
)`;

/** Available units, with inactive variants and sale windows enforced. */
export const BUYABLE_AVAIL_EXPR = `(
  CASE WHEN ${ON_SALE_EXPR} THEN ${AVAIL_EXPR} ELSE 0 END
)`;
