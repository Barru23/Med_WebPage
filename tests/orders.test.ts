import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateByVariant, totalUnits } from "../src/lib/orders.ts";

test("separate lines of the same variant are summed", () => {
  // Two friends on the same trip, both "amb bus" — the case that used to crash
  // checkout by inserting two reservations with the same (order_id, variant_id).
  const totals = aggregateByVariant([
    { variantId: "var_bus", quantity: 1 },
    { variantId: "var_bus", quantity: 1 },
  ]);
  assert.equal(totals.size, 1);
  assert.equal(totals.get("var_bus"), 2);
});

test("different variants stay separate", () => {
  const totals = aggregateByVariant([
    { variantId: "var_bus", quantity: 1 },
    { variantId: "var_sense_bus", quantity: 2 },
  ]);
  assert.deepEqual([...totals], [["var_bus", 1], ["var_sense_bus", 2]]);
});

test("a mix of repeated and distinct variants totals correctly", () => {
  const totals = aggregateByVariant([
    { variantId: "a", quantity: 2 },
    { variantId: "b", quantity: 1 },
    { variantId: "a", quantity: 3 },
  ]);
  assert.equal(totals.get("a"), 5);
  assert.equal(totals.get("b"), 1);
});

test("no lines means nothing wanted", () => {
  assert.equal(aggregateByVariant([]).size, 0);
});

test("totalUnits counts every unit, not every line", () => {
  // The per-buyer cap is on units. Three lines of two is six, not three.
  assert.equal(
    totalUnits([
      { variantId: "a", quantity: 2 },
      { variantId: "b", quantity: 2 },
      { variantId: "a", quantity: 2 },
    ]),
    6,
  );
});

test("an empty order is zero units", () => {
  assert.equal(totalUnits([]), 0);
});
