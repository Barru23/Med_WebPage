import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The D1 database bound as `DB` in wrangler.jsonc. */
export async function getDb(): Promise<D1Database> {
  // async: true works both inside a request and in static/build contexts.
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
