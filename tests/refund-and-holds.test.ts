import { test } from "node:test";
import assert from "node:assert/strict";
import { isFullRefund } from "../src/lib/orders.ts";
import { migratedDb, seedActivity, RESERVE_SQL } from "./helpers/db.ts";
import { AVAIL_EXPR } from "../src/lib/availability.ts";

const FUTURE = "2099-01-01 00:00:00";

test("a partial refund is not a refund", () => {
  // Stripe fires charge.refunded either way. Handing back the 30c booking fee
  // must not cancel a 45 EUR trip and reopen the seat.
  assert.equal(isFullRefund({ amount: 4530, amount_refunded: 30 }), false);
  assert.equal(isFullRefund({ amount: 4530, amount_refunded: 4529 }), false);

  assert.equal(isFullRefund({ amount: 4530, amount_refunded: 4530 }), true);
  // Stripe can report more than the charge across several refunds; still full.
  assert.equal(isFullRefund({ amount: 4530, amount_refunded: 4560 }), true);
});

/** Seats free right now, the way every query in the app computes it. */
function available(db: ReturnType<typeof migratedDb>, variantId: string): number {
  const row = db
    .prepare(`SELECT ${AVAIL_EXPR} AS avail FROM variant v WHERE v.id = ?`)
    .get(variantId) as { avail: number };
  return Number(row.avail);
}

test("a buyer who abandons checkout and starts again is not blocked by their own hold", () => {
  const db = migratedDb();
  seedActivity(db, { variantId: "var_bus", stock: 1 });
  db.exec(
    `INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, currency, status, payment_method, stripe_session_id)
     VALUES ('ord_first', 'act_1', 'Marc', 'marc@example.com', 4530, 'EUR', 'pending', 'stripe', 'cs_first')`,
  );
  db.prepare(RESERVE_SQL).run("res_1", "ord_first", 1, FUTURE, "var_bus", 1);

  // The last seat is now held by Marc, so Marc cannot buy it.
  assert.equal(available(db, "var_bus"), 0);

  // What submitOrder does before counting: release the buyer's own dead hold.
  db.exec(
    `UPDATE stock_reservation SET expires_at = datetime('now')
      WHERE order_id = 'ord_first' AND consumed_at IS NULL;
     UPDATE "order" SET status = 'cancelled' WHERE id = 'ord_first' AND status = 'pending';`,
  );

  assert.equal(available(db, "var_bus"), 1);
});

test("releasing one buyer's hold leaves everybody else's alone", () => {
  const db = migratedDb();
  seedActivity(db, { variantId: "var_bus", stock: 2 });
  for (const [id, email, session] of [
    ["ord_marc", "marc@example.com", "cs_marc"],
    ["ord_laia", "laia@example.com", "cs_laia"],
  ]) {
    db.exec(
      `INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, currency, status, payment_method, stripe_session_id)
       VALUES ('${id}', 'act_1', 'X', '${email}', 4530, 'EUR', 'pending', 'stripe', '${session}')`,
    );
  }
  db.prepare(RESERVE_SQL).run("res_marc", "ord_marc", 1, FUTURE, "var_bus", 1);
  db.prepare(RESERVE_SQL).run("res_laia", "ord_laia", 1, FUTURE, "var_bus", 1);
  assert.equal(available(db, "var_bus"), 0);

  db.exec(
    `UPDATE stock_reservation SET expires_at = datetime('now')
      WHERE consumed_at IS NULL
        AND order_id IN (SELECT id FROM "order"
                          WHERE buyer_email = 'marc@example.com' AND activity_id = 'act_1'
                            AND status = 'pending' AND payment_method = 'stripe');`,
  );

  // Marc's seat came back; Laia is still holding hers.
  assert.equal(available(db, "var_bus"), 1);
});
