import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale } from "@/lib/locales";

const COOKIE = "NEXT_LOCALE";
const YEAR = 60 * 60 * 24 * 365;

function preferredLocale(req: NextRequest): string {
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie;
  return defaultLocale;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin panel, R2-backed media, and API routes (Stripe webhook) aren't
  // locale-routed (§7 — Catalan-only admin interface; media/webhooks are
  // machine-to-machine, not buyer-facing pages).
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
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
