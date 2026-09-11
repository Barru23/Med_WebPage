import type { MetadataRoute } from "next";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { locales } from "@/lib/locales";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { env } = await getCloudflareContext({ async: true });
  const base = (env.PUBLIC_BASE_URL?.trim() || "https://xivarri.invalid").replace(/\/$/, "");
  const db = await getDb();
  const [{ results: departments }, { results: activities }] = await Promise.all([
    db.prepare(`SELECT slug FROM department`).all<{ slug: string }>(),
    db
      .prepare(
        `SELECT a.slug FROM activity a
          JOIN activity_edition ae ON ae.id = a.current_edition_id
         WHERE ae.published = 1 AND ae.ends_at IS NOT NULL AND a.archived = 0`,
      )
      .all<{ slug: string }>(),
  ]);
  return locales.flatMap((locale) => [
    { url: `${base}/${locale}`, changeFrequency: "daily" as const, priority: 1 },
    ...departments.map((department) => ({
      url: `${base}/${locale}/d/${department.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...activities.map((activity) => ({
      url: `${base}/${locale}/a/${activity.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
  ]);
}
