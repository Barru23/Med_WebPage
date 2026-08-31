// Shared "how many of this variant are actually free right now" logic.
//
// CLAUDE.md §4: "Stock is decremented on confirmed payment, not on checkout
// start. Hold inventory for 15 minutes during an open Stripe session, then
// release." We never mutate stock/sold for a hold — sold only moves on
// confirmed payment — so the hold is computed on the fly from still-pending
// Stripe orders younger than 15 minutes. It "releases" itself the moment
// that window passes, with no cleanup job required.
//
// Every query using this must alias the variant table as `v`.
export const HELD_BY_STRIPE = `(
  SELECT COALESCE(SUM(oi.quantity), 0)
    FROM order_item oi JOIN "order" o ON o.id = oi.order_id
   WHERE oi.variant_id = v.id AND o.status = 'pending' AND o.payment_method = 'stripe'
     AND o.created_at > datetime('now', '-15 minutes')
)`;

/** SQL expression for a variant's true remaining count. Requires alias `v`. */
export const AVAIL_EXPR = `MAX(v.stock - v.sold - ${HELD_BY_STRIPE}, 0)`;
