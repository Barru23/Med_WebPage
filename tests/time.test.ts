import { test } from "node:test";
import assert from "node:assert/strict";
import { wallTimeToUtc, utcToWallTime } from "../src/lib/time.ts";

// Girona is UTC+2 in summer (CEST) and UTC+1 in winter (CET). Before this
// conversion existed, a sale set to open at 20:00 opened at 22:00.
test("summer wall time is stored two hours earlier in UTC", () => {
  assert.equal(wallTimeToUtc("2026-07-01T20:00"), "2026-07-01 18:00:00");
});

test("winter wall time is stored one hour earlier in UTC", () => {
  assert.equal(wallTimeToUtc("2026-01-15T20:00"), "2026-01-15 19:00:00");
});

test("midnight in summer crosses back into the previous UTC day", () => {
  assert.equal(wallTimeToUtc("2026-10-01T00:00"), "2026-09-30 22:00:00");
});

test("an instant just after the autumn DST switch uses the winter offset", () => {
  // Spain moves CEST -> CET on the last Sunday of October 2026 (25th, 03:00).
  assert.equal(wallTimeToUtc("2026-10-25T12:00"), "2026-10-25 11:00:00");
  assert.equal(wallTimeToUtc("2026-10-24T12:00"), "2026-10-24 10:00:00");
});

test("round-trips back to what the admin typed", () => {
  for (const wall of ["2026-07-01T20:00", "2026-01-15T20:00", "2026-10-25T12:00"]) {
    assert.equal(utcToWallTime(wallTimeToUtc(wall)), wall);
  }
});

test("empty and malformed values stay empty rather than becoming 1970", () => {
  assert.equal(wallTimeToUtc(""), null);
  assert.equal(wallTimeToUtc("not a date"), null);
  assert.equal(utcToWallTime(null), "");
});
