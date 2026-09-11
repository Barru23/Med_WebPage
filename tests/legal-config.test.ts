import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRequiredLegalIdentity } from "../src/lib/legalConfig.ts";

test("the temporary site only requires a public organizer name and email", () => {
  assert.equal(
    hasRequiredLegalIdentity(
      "Promoció 14 Medicina UDG",
      "promocio14medicinaudg@gmail.com",
    ),
    true,
  );
});

test("checkout stays closed when either public legal value is missing or a placeholder", () => {
  assert.equal(hasRequiredLegalIdentity("Promoció 14 Medicina UDG", ""), false);
  assert.equal(hasRequiredLegalIdentity("pendent", "promocio@example.com"), false);
  assert.equal(hasRequiredLegalIdentity("Promoció", "canvia@example.com"), false);
});
