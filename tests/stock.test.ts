import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateByVariant } from "../src/lib/orders.ts";
import { migratedDb, seedActivity, soldOf, RESERVE_SQL, REFUND_SQL } from "./helpers/db.ts";

const FUTURE = "2099-01-01 00:00:00";

/** What submitOrder does once the lines are aggregated: one reservation per variant. */
function reserve(
  db: ReturnType<typeof migratedDb>,
  orderId: string,
  lines: Array<{ variantId: string; quantity: number }>,
): { reserved: number; wanted: number } {
  const wanted = aggregateByVariant(lines);
  let reserved = 0;
  let i = 0;
  for (const [variantId, quantity] of wanted) {
    const result = db
      .prepare(RESERVE_SQL)
      .run(`res_${orderId}_${i++}`, orderId, quantity, FUTURE, variantId, quantity);
    reserved += Number(result.changes);
  }
  return { reserved, wanted: wanted.size };
}

test("two tickets of the same variant reserve without violating the unique index", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 10 });
  db.exec(`INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
             VALUES ('ord_1', 'act_1', 'Marta', 'marta@example.com', 5000, 'pending')`);

  // Before the fix this threw: UNIQUE constraint failed on (order_id, variant_id).
  const { reserved, wanted } = reserve(db, "ord_1", [
    { variantId: "var_bus", quantity: 1 },
    { variantId: "var_bus", quantity: 1 },
  ]);

  assert.equal(reserved, wanted, "every variant got its reservation");
  const rows = db
    .prepare(`SELECT quantity FROM stock_reservation WHERE order_id = 'ord_1'`)
    .all() as Array<{ quantity: number }>;
  assert.equal(rows.length, 1, "one reservation row per variant, not per line");
  assert.equal(rows[0].quantity, 2, "holding both seats");
});

test("the last seat cannot be taken twice within one order", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 1 });
  db.exec(`INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
             VALUES ('ord_1', 'act_1', 'Marta', 'marta@example.com', 5000, 'pending')`);

  // Two lines of one seat each, with one seat left. Checking per line let both
  // through; checking the aggregate does not.
  const { reserved, wanted } = reserve(db, "ord_1", [
    { variantId: "var_bus", quantity: 1 },
    { variantId: "var_bus", quantity: 1 },
  ]);

  assert.equal(reserved, 0, "the guard refused the reservation");
  assert.notEqual(reserved, wanted, "submitOrder cancels the order on this mismatch");
});

test("two buyers cannot both hold the last seat", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 1 });
  for (const id of ["ord_1", "ord_2"]) {
    db.prepare(
      `INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
         VALUES (?, 'act_1', 'Comprador', 'x@example.com', 2500, 'pending')`,
    ).run(id);
  }

  const first = reserve(db, "ord_1", [{ variantId: "var_bus", quantity: 1 }]);
  const second = reserve(db, "ord_2", [{ variantId: "var_bus", quantity: 1 }]);

  assert.equal(first.reserved, 1, "the first buyer holds it");
  assert.equal(second.reserved, 0, "the second is turned away");
});

test("an expired hold releases the seat with no cleanup job", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 1 });
  db.exec(`INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
             VALUES ('ord_1', 'act_1', 'Marta', 'marta@example.com', 2500, 'pending')`);
  db.exec(`INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
             VALUES ('ord_2', 'act_1', 'Pau', 'pau@example.com', 2500, 'pending')`);
  db.exec(`INSERT INTO stock_reservation (id, order_id, variant_id, quantity, expires_at)
             VALUES ('res_old', 'ord_1', 'var_bus', 1, '2020-01-01 00:00:00')`);

  const { reserved } = reserve(db, "ord_2", [{ variantId: "var_bus", quantity: 1 }]);
  assert.equal(reserved, 1, "the abandoned checkout no longer blocks the seat");
});

test("a refund puts the seat back on sale", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 100 });
  db.prepare(`UPDATE variant SET sold = 5 WHERE id = 'var_bus'`).run();

  db.prepare(REFUND_SQL).run(2, "var_bus");

  assert.equal(soldOf(db, "var_bus"), 3, "refunding two seats returns two seats");
});

test("a refund never drives sold below zero", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 100 });
  db.prepare(`UPDATE variant SET sold = 1 WHERE id = 'var_bus'`).run();

  // The CHECK (sold >= 0) would otherwise abort the whole webhook batch.
  db.prepare(REFUND_SQL).run(3, "var_bus");

  assert.equal(soldOf(db, "var_bus"), 0);
});
