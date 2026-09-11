import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";

/**
 * Failed-login throttling for the shared admin password.
 *
 * A password everyone on the team knows is a password that gets typed into
 * group chats, so the realistic threat is someone trying a lot of guesses
 * rather than one lucky one. Attempts are counted per IP in D1 — there is no
 * KV or Durable Object in this project and none is worth adding for it.
 *
 * This is a floor, not a wall: a determined attacker changes IP. Cloudflare's
 * own rate-limiting rule on /entrar is the right second layer and costs
 * nothing, but it is dashboard configuration rather than code.
 */
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

/** Kept separate from the module so it is deliberate: this module is not for middleware. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Atomically consume one attempt and report whether it reached the limit. */
export async function consumeLoginAttempt(ip: string): Promise<boolean> {
  const db = await getDb();
  const results = await db.batch([
    db
      .prepare(`DELETE FROM login_attempt WHERE attempted_at <= datetime('now', ?)`)
      .bind(`-${WINDOW_MINUTES} minutes`),
    db
      .prepare(`INSERT INTO login_attempt (id, ip) VALUES (?, ?)`)
      .bind(newId("att"), ip),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM login_attempt
          WHERE ip = ? AND attempted_at > datetime('now', ?)`,
      )
      .bind(ip, `-${WINDOW_MINUTES} minutes`),
  ]);
  const row = results[2].results?.[0] as { n?: number } | undefined;
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

/** Clear an IP's history once it gets in, so a typo doesn't count against it later. */
export async function clearAttempts(ip: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM login_attempt WHERE ip = ?`).bind(ip).run();
}
