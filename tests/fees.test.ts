import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEE_FIXED_CENTS,
  FEE_RATE,
  serviceFeeCents,
  totalWithFeeCents,
} from "../src/lib/fees.ts";

/** What the gateway actually keeps out of a given gross charge. */
function gatewayCut(grossCents: number): number {
  return grossCents * FEE_RATE + FEE_FIXED_CENTS;
}

test("a free order pays nothing", () => {
  assert.equal(serviceFeeCents(0), 0);
  assert.equal(serviceFeeCents(-100), 0);
  assert.equal(totalWithFeeCents(0), 0);
});

test("fees land on a multiple of five cents, always rounded up", () => {
  for (const subtotal of [100, 500, 1250, 3300, 5000, 12345]) {
    const fee = serviceFeeCents(subtotal);
    assert.equal(fee % 5, 0, `${subtotal} gave ${fee}`);
  }
});

test("the organisers are never left short, at any price", () => {
  // The naive "1.5% of the ticket plus 25c" loses money as the amount grows,
  // because the gateway charges on the total it processes, fee included. This
  // is the property that has to hold.
  for (const subtotal of [100, 250, 500, 1000, 2500, 5000, 10000, 25000]) {
    const gross = totalWithFeeCents(subtotal);
    const net = gross - gatewayCut(gross);
    assert.ok(
      net >= subtotal,
      `subtotal ${subtotal} → charged ${gross} → kept ${net.toFixed(2)}, short by ${(subtotal - net).toFixed(2)}`,
    );
  }
});

test("the buyer is never overcharged by more than the rounding step", () => {
  for (const subtotal of [100, 250, 500, 1000, 2500, 5000, 10000, 25000]) {
    const gross = totalWithFeeCents(subtotal);
    const net = gross - gatewayCut(gross);
    assert.ok(net - subtotal < 5, `subtotal ${subtotal} overshot by ${(net - subtotal).toFixed(2)}`);
  }
});

test("the fifty euro case the naive formula got wrong", () => {
  // 1.5% of 5000 + 25 = 100 exactly, which would have charged 51.00 and kept
  // 49.985. Solving from the gross instead gives a fee that clears it.
  const fee = serviceFeeCents(5000);
  assert.ok(fee > 100, `expected more than 100 cents, got ${fee}`);
  const net = totalWithFeeCents(5000) - gatewayCut(totalWithFeeCents(5000));
  assert.ok(net >= 5000);
});

test("a five euro ticket costs the buyer five thirty-five", () => {
  assert.equal(serviceFeeCents(500), 35);
  assert.equal(totalWithFeeCents(500), 535);
});
