import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.MEDIA;
}

/**
 * Store an uploaded photo/poster in R2 under `folder/` and return the public
 * path to it (served by src/app/media/[...key]/route.ts). Cloudflare's free
 * tier R2 buckets aren't public by default, so the app serves them itself
 * through the MEDIA binding rather than a bucket URL.
 */
export async function saveMedia(folder: string, file: File): Promise<string> {
  const bucket = await getBucket();
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  return `/media/${key}`;
}
