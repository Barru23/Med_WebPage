import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { locales, defaultLocale } from "@/lib/locales";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/auth";

const COOKIE = "NEXT_LOCALE";
const YEAR = 60 * 60 * 24 * 365;
const LOGIN_PATH = "/entrar";

function preferredLocale(req: NextRequest): string {
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie;
  return defaultLocale;
}

async function adminPassword(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.ADMIN_PASSWORD;
  } catch {
    return undefined;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  // The admin gate lives here rather than in the admin layout. A layout that
  // returns something else instead of {children} hides the panel visually, but
  // the page underneath still runs its queries and its output still travels in
  // the response — buyer names, emails and trip answers included. Stopping the
  // request before it reaches the route is the only version that holds.
  if (isAdminPath) {
    const authorised = await verifySessionToken(
      req.cookies.get(ADMIN_COOKIE)?.value,
      await adminPassword(),
    );
    if (!authorised) {
      // Rewrite, not redirect: the address bar keeps the page they asked for,
      // so logging in lands them where they were going.
      return NextResponse.rewrite(new URL(LOGIN_PATH, req.url));
    }
    return NextResponse.next();
  }

  // R2-backed media and API routes (Stripe webhook) aren't locale-routed —
  // they're machine-to-machine, not buyer-facing pages. Same for the login
  // screen, which is Catalan-only like the rest of the admin.
  if (
    pathname === LOGIN_PATH ||
    pathname.startsWith("/media/") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/");
  const first = segments[1];

  // Path already carries a valid locale → let it through, remember it, and
  // expose it to the root layout via a request header for <html lang>.
  if ((locales as readonly string[]).includes(first)) {
    const headers = new Headers(req.headers);
    headers.set("x-locale", first);
    const res = NextResponse.next({ request: { headers } });
    res.cookies.set(COOKIE, first, { path: "/", maxAge: YEAR, sameSite: "lax" });
    return res;
  }

  // No locale prefix (e.g. "/", Instagram's "/a/{slug}") → redirect to the
  // buyer's preferred locale, defaulting to Catalan.
  const locale = preferredLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and files with an extension.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
