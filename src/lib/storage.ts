import { getCloudflareContext } from "@opennextjs/cloudflare";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SAFE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

async function getBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.MEDIA;
}

function detectedImageType(bytes: Uint8Array): keyof typeof SAFE_TYPES | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function validateImageFile(
  file: File,
): Promise<{ type: keyof typeof SAFE_TYPES; extension: string }> {
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Cada imatge ha de pesar 2 MB o menys.");
  }
  const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = detectedImageType(prefix);
  if (!type || !(type in SAFE_TYPES)) {
    throw new Error("Només s'accepten imatges JPEG, PNG o WebP vàlides.");
  }
  return { type, extension: SAFE_TYPES[type] };
}

export async function saveMedia(folder: string, file: File): Promise<string> {
  const validated = await validateImageFile(file);
  const bucket = await getBucket();
  const key = `${folder}/${crypto.randomUUID()}.${validated.extension}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: validated.type },
    customMetadata: { validated: "1" },
  });
  return `/media/${key}`;
}

export async function deleteMedia(url: string | null | undefined): Promise<void> {
  if (!url?.startsWith("/media/")) return;
  const key = decodeURIComponent(url.slice("/media/".length));
  if (!key || key.includes("..")) return;
  const bucket = await getBucket();
  await bucket.delete(key);
}

export async function deleteOrphanedMedia(
  referencedUrls: ReadonlySet<string>,
  olderThan: Date,
): Promise<number> {
  const bucket = await getBucket();
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await bucket.list({ cursor });
    const keys = page.objects
      .filter(
        (object) =>
          object.uploaded.getTime() < olderThan.getTime() &&
          !referencedUrls.has(`/media/${object.key}`),
      )
      .map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
