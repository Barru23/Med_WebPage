import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDb } from "./helpers/db.ts";
import {
  DEFAULT_MAX_PER_ORDER,
  MAX_UNITS_PER_ORDER,
  effectiveMaxPerOrder,
} from "../src/lib/orders.ts";
import {
  FREE_EMAILS_PER_CLIENT,
  FREE_EMAILS_PER_DAY,
  FREE_EMAILS_SENT_SQL,
  MAX_PENDING_PER_CLIENT,
  PENDING_FOR_CLIENT_SQL,
  freeEmailAllowed,
  hashClientKey,
} from "../src/lib/checkoutLimits.ts";

type Db = ReturnType<typeof migratedDb>;

let nextId = 0;

/** A minimal activity with one edition, as migration 0010 shapes it. */
function seed(db: Db): void {
  db.exec(`INSERT INTO department (id, slug, position, name_ca) VALUES ('dept_1', 'festes', 0, 'Festes')`);
  db.exec(`INSERT INTO activity (id, slug, department_id, type, title_ca, published)
             VALUES ('act_1', 'medigala', 'dept_1', 'event', 'Medigala', 1)`);
  db.exec(`INSERT INTO activity_edition (id, activity_id, label, published)
             VALUES ('ed_1', 'act_1', 'Tardor 2026', 1)`);
}

function addOrder(
  db: Db,
  over: { key?: string | null; status?: string; total?: number; email?: string; age?: string; edition?: string } = {},
): void {
  db.prepare(
    `INSERT INTO "order" (
       id, activity_id, activity_edition_id, buyer_name, buyer_email,
       total_cents, currency, status, payment_method, client_key,
       relay_email_status, created_at, paid_at
     ) VALUES (?, 'act_1', ?, 'Marta', 'marta@example.com', ?, 'EUR', ?, 'stripe', ?, ?,
               datetime('now', ?), datetime('now', ?))`,
  ).run(
    `ord_${nextId++}`,
    over.edition ?? "ed_1",
    over.total ?? 1500,
    over.status ?? "pending",
    over.key === undefined ? "k1" : over.key,
    over.email ?? "pending",
    over.age ?? "+0 seconds",
    over.age ?? "+0 seconds",
  );
}

function pending(db: Db, key: string, edition = "ed_1"): number {
  return (db.prepare(PENDING_FOR_CLIENT_SQL).get(key, edition) as { n: number }).n;
}

function freeSent(db: Db, key: string): { total: number; mine: number } {
  return db.prepare(FREE_EMAILS_SENT_SQL).get(key) as { total: number; mine: number };
}

test("a blank per-order limit means the default, not a hundred", () => {
  assert.equal(effectiveMaxPerOrder(null), DEFAULT_MAX_PER_ORDER);
  assert.equal(effectiveMaxPerOrder(undefined), DEFAULT_MAX_PER_ORDER);
  assert.equal(effectiveMaxPerOrder(0), DEFAULT_MAX_PER_ORDER);
  assert.equal(effectiveMaxPerOrder(4), 4);
  assert.equal(effectiveMaxPerOrder(40), 40, "an admin can still allow a big group");
  assert.equal(effectiveMaxPerOrder(5000), MAX_UNITS_PER_ORDER);
});

test("only this client's live holds on this edition count", () => {
  const db = migratedDb();
  seed(db);
  db.exec(`INSERT INTO activity_edition (id, activity_id, label, published)
             VALUES ('ed_2', 'act_1', 'Primavera 2027', 0)`);

  for (let i = 0; i < MAX_PENDING_PER_CLIENT; i++) addOrder(db);
  addOrder(db, { key: "k2" }); // somebody else
  addOrder(db, { edition: "ed_2" }); // another edition
  addOrder(db, { status: "paid" }); // a finished purchase holds nothing
  addOrder(db, { status: "cancelled" });
  addOrder(db, { age: "-50 minutes" }); // a hold whose session is long gone

  assert.equal(pending(db, "k1"), MAX_PENDING_PER_CLIENT);
  assert.equal(pending(db, "k2"), 1);
  assert.equal(pending(db, "k1", "ed_2"), 1);
});

test("free-order emails are counted per day, overall and per client", () => {
  const db = migratedDb();
  seed(db);
  addOrder(db, { total: 0, status: "paid", email: "sent" });
  addOrder(db, { total: 0, status: "paid", email: "sent", key: "k2" });
  addOrder(db, { total: 0, status: "paid", email: "pending" }); // held, not sent
  addOrder(db, { total: 1500, status: "paid", email: "sent" }); // paid orders never count
  addOrder(db, { total: 0, status: "paid", email: "sent", age: "-2 days" });

  assert.deepEqual({ ...freeSent(db, "k1") }, { total: 2, mine: 1 });
  assert.deepEqual({ ...freeSent(db, "nobody") }, { total: 2, mine: 0 });
});

test("the email caps hold back the one email past either limit", () => {
  assert.equal(freeEmailAllowed({ total: 0, mine: 0 }), true);
  assert.equal(freeEmailAllowed({ total: 0, mine: FREE_EMAILS_PER_CLIENT - 1 }), true);
  assert.equal(freeEmailAllowed({ total: 0, mine: FREE_EMAILS_PER_CLIENT }), false);
  assert.equal(freeEmailAllowed({ total: FREE_EMAILS_PER_DAY - 1, mine: 0 }), true);
  assert.equal(freeEmailAllowed({ total: FREE_EMAILS_PER_DAY, mine: 0 }), false);
  // Paid orders must keep most of Gmail's ~100 a day.
  assert.ok(FREE_EMAILS_PER_DAY <= 50);
});

test("the stored client key is a hash, stable per client", async () => {
  const a = await hashClientKey("203.0.113.7");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes("203"));
  assert.equal(await hashClientKey("203.0.113.7"), a);
  assert.notEqual(await hashClientKey("203.0.113.8"), a);
});
