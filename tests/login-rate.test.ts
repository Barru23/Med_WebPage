import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDb } from "./helpers/db.ts";

// The SQL from src/lib/loginRate.ts, verbatim.
const COUNT_SQL = `SELECT COUNT(*) AS n FROM login_attempt
  WHERE ip = ? AND attempted_at > datetime('now', ?)`;
const SWEEP_SQL = `DELETE FROM login_attempt WHERE attempted_at <= datetime('now', ?)`;
const WINDOW = "-15 minutes";
const MAX_ATTEMPTS = 10;

let nextId = 0;

function fail(db: ReturnType<typeof migratedDb>, ip: string, n: number, when = "now") {
  for (let i = 0; i < n; i++) {
    db.prepare(
      `INSERT INTO login_attempt (id, ip, attempted_at) VALUES (?, ?, datetime('now', ?))`,
    ).run(`att_${nextId++}`, ip, when === "now" ? "+0 seconds" : when);
  }
}

function attempts(db: ReturnType<typeof migratedDb>, ip: string): number {
  return (db.prepare(COUNT_SQL).get(ip, WINDOW) as { n: number }).n;
}

test("nine failures still let someone in, ten do not", () => {
  const db = migratedDb();
  fail(db, "1.1.1.1", 9);
  assert.ok(attempts(db, "1.1.1.1") < MAX_ATTEMPTS, "a forgetful admin is not locked out");
  fail(db, "1.1.1.1", 1);
  assert.ok(attempts(db, "1.1.1.1") >= MAX_ATTEMPTS, "a guesser is");
});

test("one address being throttled does not throttle another", () => {
  const db = migratedDb();
  fail(db, "1.1.1.1", 20);
  assert.equal(attempts(db, "2.2.2.2"), 0);
});

test("failures older than the window stop counting", () => {
  const db = migratedDb();
  fail(db, "1.1.1.1", 20, "-20 minutes");
  assert.equal(attempts(db, "1.1.1.1"), 0, "the lockout expires on its own");
});

test("the sweep removes stale rows and keeps recent ones", () => {
  const db = migratedDb();
  fail(db, "1.1.1.1", 5, "-20 minutes");
  fail(db, "1.1.1.1", 3);
  db.prepare(SWEEP_SQL).run(WINDOW);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM login_attempt`).get() as { n: number }
  ).n;
  assert.equal(total, 3, "the table does not grow without bound");
});
