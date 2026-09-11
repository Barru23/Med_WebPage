import type { MetadataRoute } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { env } = await getCloudflareContext({ async: true });
  const base = (env.PUBLIC_BASE_URL?.trim() || "https://xivarri.invalid").replace(/\/$/, "");
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
