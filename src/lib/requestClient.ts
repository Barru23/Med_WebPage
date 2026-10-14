import { headers } from "next/headers";
import { networkKey } from "@/lib/clientNetwork";

/**
 * The caller's address as Cloudflare saw it. `cf-connecting-ip` is set by
 * Cloudflare's edge and overwrites whatever the client sent, so it cannot be
 * spoofed in production; `x-forwarded-for` only matters on a local dev server.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** The key every per-client limit counts under: an IPv4 address or an IPv6 /64. */
export async function clientKey(): Promise<string> {
  return networkKey(await clientIp());
}
