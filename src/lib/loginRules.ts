/**
 * The numbers and SQL behind admin login throttling (src/lib/loginRate.ts),
 * kept free of Next and Cloudflare imports so the tests run the exact same
 * statements against a real migrated schema.
 *
 * Two limits, both over the same sliding window:
 *
 * - **Per client** — MAX_ATTEMPTS from one network key (an IPv4 address or an
 *   IPv6 /64, see src/lib/clientNetwork.ts). Stops one person guessing.
 * - **Global** — GLOBAL_MAX_ATTEMPTS across everyone. Stops many addresses
 *   guessing together, which the per-client limit alone cannot see. The price
 *   is that a large enough flood also locks the real admins out of NEW logins
 *   for one window; sessions already open keep working. A team of three does
 *   not reach fifty wrong passwords in fifteen minutes by accident.
 *
 * Cloudflare Access in front of /admin remains the real second lock; this is
 * the floor that holds without it.
 */
export const WINDOW_MINUTES = 15;
export const MAX_ATTEMPTS = 10;
export const GLOBAL_MAX_ATTEMPTS = 50;

export const WINDOW = `-${WINDOW_MINUTES} minutes`;

/** Old rows go first, so the counts below only ever see the current window. */
export const SWEEP_SQL = `DELETE FROM login_attempt WHERE attempted_at <= datetime('now', ?)`;

/**
 * Record one attempt ONLY while both limits still have room. Bound as
 * (id, key, key, WINDOW, MAX_ATTEMPTS, WINDOW, GLOBAL_MAX_ATTEMPTS).
 *
 * Inserting conditionally, inside the same batch as the sweep, keeps the check
 * atomic under parallel requests, and means a blocked guess writes nothing — a
 * flood against a locked door does not also burn the free tier's D1 writes.
 * Zero rows changed means "blocked".
 */
export const CONSUME_SQL = `INSERT INTO login_attempt (id, ip)
  SELECT ?, ?
   WHERE (SELECT COUNT(*) FROM login_attempt
           WHERE ip = ? AND attempted_at > datetime('now', ?)) < ?
     AND (SELECT COUNT(*) FROM login_attempt
           WHERE attempted_at > datetime('now', ?)) < ?`;

/** Bind values for CONSUME_SQL, in order. */
export function consumeParams(id: string, key: string): Array<string | number> {
  return [id, key, key, WINDOW, MAX_ATTEMPTS, WINDOW, GLOBAL_MAX_ATTEMPTS];
}
