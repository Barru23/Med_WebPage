import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AVAIL_EXPR, ON_SALE_EXPR } from "../../src/lib/availability.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations");

/**
 * An in-memory SQLite with the real migrations applied, so tests run against
 * the same schema and constraints D1 enforces in production.
 */
export function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/** One department + activity + variant, ready to sell `stock` seats. */
export function seedActivity(
  db: DatabaseSync,
  { variantId = "var_bus", stock = 10, price = 2500 } = {},
): void {
  db.exec(`INSERT OR IGNORE INTO department (id, slug, position, name_ca)
             VALUES ('dept_1', 'activitats', 0, 'Activitats')`);
  db.exec(`INSERT OR IGNORE INTO activity (id, slug, department_id, type, title_ca, published)
             VALUES ('act_1', 'mediportaventura', 'dept_1', 'trip', 'Mediportaventura', 1)`);
  db.prepare(
    `INSERT INTO variant (id, activity_id, name_ca, price_cents, stock, sold)
       VALUES (?, 'act_1', 'Amb bus', ?, ?, 0)`,
  ).run(variantId, price, stock);
}

/**
 * The reservation insert from src/lib/actions/checkout.ts.
 *
 * The sale-window and active checks are IMPORTED rather than copied, so the
 * test cannot quietly drift from the query it claims to be testing. The rest
 * is the statement as checkout.ts builds it.
 */
export const RESERVE_SQL = `INSERT INTO stock_reservation (id, order_id, variant_id, quantity, expires_at)
  SELECT ?, ?, v.id, ?, ?
    FROM variant v
   WHERE v.id = ?
     AND ${ON_SALE_EXPR}
     AND ${AVAIL_EXPR} >= ?`;
