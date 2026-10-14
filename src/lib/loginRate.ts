import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { CONSUME_SQL, SWEEP_SQL, WINDOW, consumeParams } from "@/lib/loginRules";

/**
 * Failed-login throttling for the shared admin password.
 *
 * A password everyone on the team knows is a password that gets typed into
 * group chats, so the realistic threat is someone trying a lot of guesses
 * rather than one lucky one. Attempts are counted in D1 — there is no KV or
 * Durable Object in this project and none is worth adding for it. The limits
 * themselves, and why there are two, are in src/lib/loginRules.ts.
 *
 * The `ip` column holds the network key, not the raw address: an IPv6 client
 * is counted by its /64, because it can rotate through the rest for free.
 */

/** Atomically consume one attempt; true when a limit is already reached. */
export async function consumeLoginAttempt(key: string): Promise<boolean> {
  const db = await getDb();
  const results = await db.batch([
    db.prepare(SWEEP_SQL).bind(WINDOW),
    db.prepare(CONSUME_SQL).bind(...consumeParams(newId("att"), key)),
  ]);
  return !results[1].meta.changes;
}

/** Clear a client's history once it gets in, so a typo doesn't count against it later. */
export async function clearAttempts(key: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM login_attempt WHERE ip = ?`).bind(key).run();
}
