import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

// Serves R2-stored posters/photos through the MEDIA binding, since the free
// tier bucket isn't public. Long cache — keys are random, uploads immutable.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const { env } = await getCloudflareContext({ async: true });
  const object = await env.MEDIA.get(key.join("/"));
  if (!object) return new NextResponse("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);

  return new NextResponse(object.body, { headers });
}
