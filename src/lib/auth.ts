import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Admin authentication: one shared password, held as the Cloudflare secret
 * ADMIN_PASSWORD and never stored in the database or in Git.
 *
 * The session cookie is an expiry timestamp plus an HMAC of it, keyed by the
 * independent ADMIN_SESSION_SECRET. This keeps a leaked cookie-signing key from
 * disclosing the shared login password; rotate both secrets when access changes.
 *
 * This is the *only* thing standing in front of /admin, so it is checked in
 * three places: the admin layout (every page), the export route handler (which
 * has no layout above it), and inside each server action (which can be reached
 * without rendering a page at all).
 */
export const ADMIN_COOKIE = "xivarri_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;

async function adminPassword(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  const value = env.ADMIN_PASSWORD;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function adminSessionSecret(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  const value = env.ADMIN_SESSION_SECRET;
  return typeof value === "string" && value.length >= 32 ? value : null;
}

/** Whether an ADMIN_PASSWORD secret exists at all, for the login screen copy. */
export async function isConfigured(): Promise<boolean> {
  return (await adminPassword()) !== null && (await adminSessionSecret()) !== null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return toBase64Url(signature);
}

/** Length-independent comparison, so a wrong guess reveals nothing by timing. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Compare a fixed-size digest-shaped buffer either way, then require the
  // lengths to have matched too.
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** True when the supplied password matches the configured one. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const password = await adminPassword();
  if (!password) return false;
  return safeEqual(candidate, password);
}

export async function startSession(): Promise<boolean> {
  const secret = await adminSessionSecret();
  if (!secret) return false;
  const expiresAt = Date.now() + SESSION_MS;
  const token = `${expiresAt}.${await sign(String(expiresAt), secret)}`;
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_MS / 1000,
  });
  return true;
}

export async function endSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
  });
}

/**
 * Verify a session cookie against the session secret. Kept free of next/headers and
 * of the Cloudflare context helper so src/proxy.ts can call it too — the proxy
 * is where the check has to happen, because a layout that declines to render
 * its children still lets those children run and ship their data in the
 * response payload.
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!token || !secret) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(token.slice(separator + 1), await sign(String(expiresAt), secret));
}

/** Whether the current request carries a valid, unexpired admin session. */
export async function isAdmin(): Promise<boolean> {
  const secret = await adminSessionSecret();
  if (!secret) return false;
  return verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value, secret);
}

/**
 * Guard for admin PAGES. Must be the first statement in the page component,
 * before any query: a check in the layout is not enough, because a layout that
 * declines to render its children still lets those children run and ship their
 * data inside the response payload. Next's own guidance says the same — verify
 * inside each function rather than relying on the proxy alone.
 */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/entrar");
}

/**
 * Guard for server actions and route handlers. Throws rather than redirecting,
 * because an unauthenticated caller here is not a user who took a wrong turn —
 * it is a request that should never have been made.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("No autoritzat.");
}
