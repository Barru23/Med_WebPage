import { headers } from "next/headers";

/**
 * Cloudflare Access identity (CLAUDE.md §3 — no custom auth code). The Access
 * policy on `/admin*` is configured in the Cloudflare dashboard, not here: it
 * blocks unauthenticated requests at the edge before they ever reach this
 * Worker. This just reads the header Access injects, to greet the admin by
 * email. Locally (no Access running), the header is simply absent.
 */
export async function getAccessEmail(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-access-authenticated-user-email");
}
