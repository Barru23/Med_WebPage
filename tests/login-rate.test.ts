import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDb } from "./helpers/db.ts";
import { networkKey } from "../src/lib/clientNetwork.ts";
import {
  CONSUME_SQL,
  GLOBAL_MAX_ATTEMPTS,
  MAX_ATTEMPTS,
  SWEEP_SQL,
  WINDOW,
  consumeParams,
} from "../src/lib/loginRules.ts";

// The statements are imported from src/lib/loginRules.ts, not copied, so the
// test cannot drift from what src/lib/loginRate.ts runs.

let nextId = 0;

/** One login attempt, as the action makes it: true when it was let through. */
function attempt(db: ReturnType<typeof migratedDb>, ip: string): boolean {
  db.prepare(SWEEP_SQL).run(WINDOW);
  const result = db.prepare(CONSUME_SQL).run(...consumeParams(`att_${nextId++}`, networkKey(ip)));
  return result.changes === 1;
}

/** Old attempts, written straight into the table. */
function backdate(db: ReturnType<typeof migratedDb>, ip: string, n: number, when: string) {
  for (let i = 0; i < n; i++) {
    db.prepare(
      `INSERT INTO login_attempt (id, ip, attempted_at) VALUES (?, ?, datetime('now', ?))`,
    ).run(`att_${nextId++}`, networkKey(ip), when);
  }
}

function rows(db: ReturnType<typeof migratedDb>): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM login_attempt`).get() as { n: number }).n;
}

test(`${MAX_ATTEMPTS} attempts get through, the next one does not`, () => {
  const db = migratedDb();
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    assert.equal(attempt(db, "203.0.113.7"), true, "a forgetful admin is not locked out");
  }
  assert.equal(attempt(db, "203.0.113.7"), false, "a guesser is");
});

test("a blocked attempt writes nothing", () => {
  const db = migratedDb();
  for (let i = 0; i < MAX_ATTEMPTS; i++) attempt(db, "203.0.113.7");
  const before = rows(db);
  for (let i = 0; i < 20; i++) attempt(db, "203.0.113.7");
  assert.equal(rows(db), before, "a flood against a locked door costs no D1 writes");
});

test("one address being throttled does not throttle another", () => {
  const db = migratedDb();
  for (let i = 0; i < MAX_ATTEMPTS; i++) attempt(db, "203.0.113.7");
  assert.equal(attempt(db, "198.51.100.2"), true);
});

test("rotating through one IPv6 /64 does not reset the count", () => {
  const db = migratedDb();
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    assert.equal(attempt(db, `2001:db8:1:2::${(i + 1).toString(16)}`), true);
  }
  assert.equal(attempt(db, "2001:db8:1:2:ffff:ffff:ffff:ffff"), false);
  // A different /64 is a different subscriber.
  assert.equal(attempt(db, "2001:db8:1:3::1"), true);
});

test("many addresses together hit the global ceiling", () => {
  const db = migratedDb();
  let letThrough = 0;
  for (let i = 0; i < GLOBAL_MAX_ATTEMPTS + 10; i++) {
    if (attempt(db, `198.51.100.${i % 250}`)) letThrough++;
  }
  assert.equal(letThrough, GLOBAL_MAX_ATTEMPTS);
  assert.equal(attempt(db, "192.0.2.1"), false, "a fresh address is still refused");
});

test("failures older than the window stop counting", () => {
  const db = migratedDb();
  backdate(db, "203.0.113.7", 20, "-20 minutes");
  assert.equal(attempt(db, "203.0.113.7"), true, "the lockout expires on its own");
});

test("the sweep removes stale rows and keeps recent ones", () => {
  const db = migratedDb();
  backdate(db, "203.0.113.7", 5, "-20 minutes");
  backdate(db, "203.0.113.7", 3, "+0 seconds");
  db.prepare(SWEEP_SQL).run(WINDOW);
  assert.equal(rows(db), 3, "the table does not grow without bound");
});

test("network keys: IPv4 as is, IPv6 by /64, mapped IPv4 folded back", () => {
  assert.equal(networkKey("203.0.113.7"), "203.0.113.7");
  assert.equal(networkKey(" 203.0.113.7 "), "203.0.113.7");
  assert.equal(networkKey("2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(networkKey("2001:db8:1:2::1"), "2001:db8:1:2::/64");
  assert.equal(networkKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(networkKey("::1"), "0:0:0:0::/64");
  assert.equal(networkKey("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(networkKey("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(networkKey("::ffff:cb00:7107"), "203.0.113.7");
  // Garbage is still one client, never "no limit".
  assert.equal(networkKey("not-an-ip"), "not-an-ip");
  assert.equal(networkKey(""), "unknown");
  assert.equal(networkKey("1:2:3:4:5:6:7:8:9"), "1:2:3:4:5:6:7:8:9");
});
