import { test } from "node:test";
import assert from "node:assert/strict";
import { BUYABLE_AVAIL_EXPR } from "../src/lib/availability.ts";
import { eurosToCents } from "../src/lib/admin/money.ts";
import { migratedDb, RESERVE_SQL, seedActivity } from "./helpers/db.ts";

test("prices accept euros with a comma or point and reject ambiguous input", () => {
  assert.equal(eurosToCents("12,50"), 1250);
  assert.equal(eurosToCents("12.5"), 1250);
  assert.equal(eurosToCents("0"), 0);
  assert.equal(eurosToCents(""), null);
  assert.equal(eurosToCents("gratis"), null);
  assert.equal(eurosToCents("12 euros"), null);
  assert.equal(eurosToCents("12.345"), null);
  assert.equal(eurosToCents("-1"), null);
});

test("availability is zero before and after the configured sale window", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 10 });

  const availability = () =>
    Number(
      (
        db
          .prepare(`SELECT ${BUYABLE_AVAIL_EXPR} AS avail FROM variant v WHERE v.id = 'var_bus'`)
          .get() as { avail: number }
      ).avail,
    );

  assert.equal(availability(), 10);
  db.exec(`UPDATE variant SET sale_start = '2999-01-01 00:00:00' WHERE id = 'var_bus'`);
  assert.equal(availability(), 0);
  db.exec(
    `UPDATE variant SET sale_start = NULL, sale_end = '2000-01-01 00:00:00' WHERE id = 'var_bus'`,
  );
  assert.equal(availability(), 0);
});

test("the reservation write also refuses variants outside their sale window", () => {
  const db = migratedDb();
  seedActivity(db, { stock: 10 });
  db.exec(`UPDATE variant SET sale_start = '2999-01-01 00:00:00' WHERE id = 'var_bus'`);
  db.exec(
    `INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
     VALUES ('ord_future', 'act_1', 'Marta', 'marta@example.com', 2500, 'pending')`,
  );

  const result = db
    .prepare(RESERVE_SQL)
    .run("res_future", "ord_future", 1, "2999-01-01 00:00:00", "var_bus", 1);
  assert.equal(result.changes, 0);
});

test("retiring a variant preserves historical order references", () => {
  const db = migratedDb();
  seedActivity(db);
  db.exec(
    `INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, total_cents, status)
     VALUES ('ord_old', 'act_1', 'Marta', 'marta@example.com', 2500, 'paid')`,
  );
  db.exec(
    `INSERT INTO order_item (id, order_id, variant_id, quantity, ticket_code)
     VALUES ('oi_old', 'ord_old', 'var_bus', 1, 'ABC123')`,
  );

  db.exec(`UPDATE variant SET active = 0 WHERE id = 'var_bus'`);
  const row = db
    .prepare(
      `SELECT v.active, oi.ticket_code
         FROM order_item oi JOIN variant v ON v.id = oi.variant_id
        WHERE oi.id = 'oi_old'`,
    )
    .get() as { active: number; ticket_code: string };

  assert.equal(row.active, 0);
  assert.equal(row.ticket_code, "ABC123");
});
