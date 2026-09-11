import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("the privacy migration classifies common legacy sensitive fields", () => {
  const db = new DatabaseSync(":memory:");
  const directory = join(import.meta.dirname, "..", "migrations");
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    if (file === "0013_privacy_retention.sql") {
      db.exec(`
        INSERT INTO department (id, slug, name_ca) VALUES ('d', 'd', 'D');
        INSERT INTO activity (id, slug, department_id, type, title_ca)
          VALUES ('a', 'a', 'd', 'trip', 'A');
        INSERT INTO field (id, activity_id, label_ca, type) VALUES
          ('dni', 'a', 'DNI', 'text'),
          ('health', 'a', 'Al·lèrgies i intoleràncies', 'text'),
          ('normal', 'a', 'Parada de bus', 'text');
      `);
    }
    db.exec(readFileSync(join(directory, file), "utf8"));
  }

  const rows = db.prepare(
    `SELECT id, data_classification FROM field ORDER BY id`,
  ).all() as Array<{ id: string; data_classification: string }>;
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: "dni", data_classification: "identity" },
    { id: "health", data_classification: "health" },
    { id: "normal", data_classification: "standard" },
  ]);
});
