import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migratedDb } from "./helpers/db.ts";

test("the demo seed matches the current edition and privacy schema", () => {
  const db = migratedDb();
  const seed = readFileSync(join(import.meta.dirname, "..", "seed.sql"), "utf8");
  db.exec(seed);
  db.exec(seed);

  const activity = db.prepare(
    `SELECT ae.ends_at, ae.published,
            (SELECT COUNT(*) FROM variant v WHERE v.edition_id = ae.id) AS variants
       FROM activity a JOIN activity_edition ae ON ae.id = a.current_edition_id
      WHERE a.id = 'act_mediportaventura'`,
  ).get() as { ends_at: string | null; published: number; variants: number };
  assert.ok(activity.ends_at);
  assert.equal(activity.published, 1);
  assert.equal(activity.variants, 2);

  const classifications = db.prepare(
    `SELECT id, data_classification FROM field
      WHERE id IN ('fld_mpv_dni', 'fld_mpv_allergies') ORDER BY id`,
  ).all() as Array<{ id: string; data_classification: string }>;
  assert.deepEqual(
    classifications.map((row) => ({ ...row })),
    [
      { id: "fld_mpv_allergies", data_classification: "health" },
      { id: "fld_mpv_dni", data_classification: "identity" },
    ],
  );
});
