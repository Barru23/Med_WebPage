/**
 * Abuse limits on the public checkout, kept free of Next and Cloudflare
 * imports so the tests run these exact statements against the real schema.
 *
 * Checkout needs no account, so nothing stops a script from filling the form
 * in a loop. Two things are worth protecting:
 *
 * - **Stock.** Every open checkout holds its seats for the life of the Stripe
 *   session. A handful of unpaid checkouts could otherwise freeze a whole
 *   activity. Holds are therefore capped per client key, per edition.
 * - **The Gmail quota.** A free order is confirmed instantly and emailed from
 *   the shared Google account, which sends ~100 a day. Free-order emails are
 *   capped per client and per day; past the cap the order still completes,
 *   the code is still on screen, and the email waits on Operations for an admin
 *   to send it by hand.
 *
 * Client keys are shared by everyone behind one router — a campus network, a
 * phone carrier's NAT. That is why both caps only ever block HOLDS and EMAILS,
 * never a completed purchase, and why the pending cap is not tighter.
 */

/** Open (unpaid) checkouts one client key may hold on one edition at once. */
export const MAX_PENDING_PER_CLIENT = 5;

/** Free-order emails sent in a rolling day, across everyone. */
export const FREE_EMAILS_PER_DAY = 40;

/** Free-order emails one client key may trigger in a rolling day. */
export const FREE_EMAILS_PER_CLIENT = 3;

/**
 * How long a pending order can still be holding stock: the Stripe session plus
 * the webhook margin checkout.ts adds. Older pending rows are on their way to
 * being cancelled and do not count.
 */
export const HOLD_WINDOW = "-45 minutes";

/** Open checkouts for (client_key, edition_id). */
export const PENDING_FOR_CLIENT_SQL = `SELECT COUNT(*) AS n FROM "order"
  WHERE client_key = ? AND activity_edition_id = ? AND status = 'pending'
    AND created_at > datetime('now', '${HOLD_WINDOW}')`;

/** Free-order emails sent in the last day, overall and for (client_key). */
export const FREE_EMAILS_SENT_SQL = `SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN client_key = ? THEN 1 ELSE 0 END), 0) AS mine
  FROM "order"
  WHERE total_cents = 0 AND status = 'paid'
    AND relay_email_status = 'sent'
    AND paid_at > datetime('now', '-1 day')`;

/** What the admin sees on Operations when a free order's email was held back. */
export const FREE_EMAIL_HELD =
  "Correu retingut: límit diari de correus per inscripcions gratuïtes. Envia'l a mà des de Vendes si cal.";

/** Whether one more free-order email may go out. */
export function freeEmailAllowed(sent: { total: number; mine: number }): boolean {
  return sent.total < FREE_EMAILS_PER_DAY && sent.mine < FREE_EMAILS_PER_CLIENT;
}

/**
 * A SHA-256 of the client key, so the database never holds an address. Not a
 * strong anonymisation on its own — IPv4 is small enough to brute-force — which
 * is why the column is also cleared after a day by the maintenance route.
 */
export async function hashClientKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`xivarri:${key}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
