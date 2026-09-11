import { test } from "node:test";
import assert from "node:assert/strict";
import { AVAIL_EXPR } from "../src/lib/availability.ts";
import { migratedDb } from "./helpers/db.ts";

test("two check-ins report one new use and one already-used ticket", () => {
  const db = migratedDb();
  db.exec(`
    INSERT INTO department (id, slug, name_ca) VALUES ('d', 'd', 'D');
    INSERT INTO activity (id, slug, department_id, type, title_ca)
      VALUES ('a', 'a', 'd', 'event', 'A');
    INSERT INTO variant (id, activity_id, name_ca, stock) VALUES ('v', 'a', 'General', 1);
    INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, status)
      VALUES ('o', 'a', 'Marta', 'm@example.com', 'paid');
    INSERT INTO order_item (id, order_id, variant_id, ticket_code)
      VALUES ('oi', 'o', 'v', 'CHECKIN1');
  `);
  const checkIn = db.prepare(`
    UPDATE order_item SET checked_in_at = datetime('now')
     WHERE ticket_code = ? AND checked_in_at IS NULL
       AND EXISTS (
         SELECT 1 FROM "order" o
          WHERE o.id = order_item.order_id
            AND o.status = 'paid' AND o.dispute_status != 'open'
       )`);
  assert.equal(checkIn.run("CHECKIN1").changes, 1);
  assert.equal(checkIn.run("CHECKIN1").changes, 0);
});

test("an open dispute blocks entry but keeps the seat allocated", () => {
  const db = migratedDb();
  db.exec(`
    INSERT INTO department (id, slug, name_ca) VALUES ('d', 'd', 'D');
    INSERT INTO activity (id, slug, department_id, type, title_ca)
      VALUES ('a', 'a', 'd', 'event', 'A');
    INSERT INTO variant (id, activity_id, name_ca, stock) VALUES ('v', 'a', 'General', 1);
    INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, status, dispute_status)
      VALUES ('o', 'a', 'Marta', 'm@example.com', 'paid', 'open');
    INSERT INTO order_item (id, order_id, variant_id, ticket_code)
      VALUES ('oi', 'o', 'v', 'DISPUTE1');
  `);
  const available = db.prepare(`SELECT ${AVAIL_EXPR} AS n FROM variant v WHERE id = 'v'`)
    .get() as { n: number };
  assert.equal(available.n, 0);
  const changed = db.prepare(`
    UPDATE order_item SET checked_in_at = datetime('now')
     WHERE id = 'oi' AND EXISTS (
       SELECT 1 FROM "order" o WHERE o.id = order_item.order_id
       AND o.status = 'paid' AND o.dispute_status != 'open'
     )`).run();
  assert.equal(changed.changes, 0);
});

test("answer snapshots survive deleting the activity field", () => {
  const db = migratedDb();
  db.exec(`
    INSERT INTO department (id, slug, name_ca) VALUES ('d', 'd', 'D');
    INSERT INTO activity (id, slug, department_id, type, title_ca)
      VALUES ('a', 'a', 'd', 'trip', 'A');
    INSERT INTO variant (id, activity_id, name_ca, stock) VALUES ('v', 'a', 'Bus', 1);
    INSERT INTO field (id, activity_id, label_ca, type)
      VALUES ('f', 'a', 'DNI', 'text');
    INSERT INTO "order" (id, activity_id, buyer_name, buyer_email, status)
      VALUES ('o', 'a', 'Marta', 'm@example.com', 'paid');
    INSERT INTO order_item (id, order_id, variant_id, ticket_code)
      VALUES ('oi', 'o', 'v', 'ANSWER01');
    INSERT INTO order_item_answer (
      id, order_item_id, field_id_snapshot, label_ca_snapshot,
      field_type_snapshot, value_text
    ) VALUES ('ans', 'oi', 'f', 'DNI', 'text', '12345678Z');
    DELETE FROM field WHERE id = 'f';
  `);
  const answer = db.prepare(
    `SELECT label_ca_snapshot, value_text FROM order_item_answer WHERE id = 'ans'`,
  ).get() as { label_ca_snapshot: string; value_text: string };
  assert.equal(answer.label_ca_snapshot, "DNI");
  assert.equal(answer.value_text, "12345678Z");
});

test("editions have independent inventory", () => {
  const db = migratedDb();
  db.exec(`
    INSERT INTO department (id, slug, name_ca) VALUES ('d', 'd', 'D');
    INSERT INTO activity (id, slug, department_id, type, title_ca)
      VALUES ('a', 'a', 'd', 'event', 'A');
    INSERT INTO activity_edition (id, activity_id, label) VALUES ('e1', 'a', '2026');
    INSERT INTO activity_edition (id, activity_id, label) VALUES ('e2', 'a', '2027');
    UPDATE activity SET current_edition_id = 'e2' WHERE id = 'a';
    INSERT INTO variant (id, activity_id, edition_id, name_ca, stock)
      VALUES ('v1', 'a', 'e1', 'General', 1);
    INSERT INTO variant (id, activity_id, edition_id, name_ca, stock)
      VALUES ('v2', 'a', 'e2', 'General', 1);
    INSERT INTO "order" (
      id, activity_id, activity_edition_id, buyer_name, buyer_email, status
    ) VALUES ('o1', 'a', 'e1', 'Marta', 'm@example.com', 'paid');
    INSERT INTO order_item (id, order_id, variant_id, ticket_code)
      VALUES ('oi1', 'o1', 'v1', 'EDITION1');
  `);
  const oldEdition = db.prepare(`SELECT ${AVAIL_EXPR} AS n FROM variant v WHERE id = 'v1'`)
    .get() as { n: number };
  const newEdition = db.prepare(`SELECT ${AVAIL_EXPR} AS n FROM variant v WHERE id = 'v2'`)
    .get() as { n: number };
  assert.equal(oldEdition.n, 0);
  assert.equal(newEdition.n, 1);
});
