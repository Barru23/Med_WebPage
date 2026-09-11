import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { deleteOrphanedMedia } from "@/lib/storage";

function safeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true });
  const configured = env.MAINTENANCE_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !safeEqual(configured, supplied)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = await getDb();
  const results = await db.batch([
    db.prepare(`DELETE FROM login_attempt WHERE attempted_at < datetime('now', '-15 minutes')`),
    db.prepare(
      `UPDATE stripe_event
          SET processing_status = 'failed', last_error = 'Processing lease expired'
        WHERE processing_status = 'processing'
          AND processing_started_at < datetime('now', '-5 minutes')`,
    ),
    db.prepare(
      `DELETE FROM stripe_event
        WHERE processing_status = 'processed'
          AND processed_at < datetime('now', '-90 days')`,
    ),
    db.prepare(
      `UPDATE "order" SET status = 'cancelled'
        WHERE status = 'pending' AND stripe_session_id IS NULL
          AND created_at < datetime('now', '-2 hours')`,
    ),
    db.prepare(
      `UPDATE stock_reservation SET expires_at = datetime('now')
        WHERE consumed_at IS NULL
          AND order_id IN (
            SELECT id FROM "order"
             WHERE status = 'cancelled'
          )`,
    ),
    db.prepare(
      `DELETE FROM order_item_answer
        WHERE data_classification_snapshot IN ('identity', 'health')
          AND order_item_id IN (
            SELECT oi.id
              FROM order_item oi
              JOIN "order" o ON o.id = oi.order_id
              JOIN activity_edition ae ON ae.id = o.activity_edition_id
             WHERE ae.ends_at IS NOT NULL
               AND ae.ends_at < datetime('now', '-1 day')
          )`,
    ),
    db.prepare(
      `UPDATE order_item
          SET field_answers_json = (
            SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                        ELSE json_group_object(a.field_id_snapshot, a.value_text) END
              FROM order_item_answer a
             WHERE a.order_item_id = order_item.id
          )
        WHERE id IN (
          SELECT oi.id
            FROM order_item oi
            JOIN "order" o ON o.id = oi.order_id
            JOIN activity_edition ae ON ae.id = o.activity_edition_id
           WHERE ae.ends_at IS NOT NULL
             AND ae.ends_at < datetime('now', '-1 day')
        )`,
    ),
    db.prepare(
      `DELETE FROM order_item_answer
        WHERE order_item_id IN (
          SELECT oi.id
            FROM order_item oi
            JOIN "order" o ON o.id = oi.order_id
            JOIN activity_edition ae ON ae.id = o.activity_edition_id
           WHERE ae.ends_at IS NOT NULL
             AND ae.ends_at < datetime('now', '-12 months')
        )`,
    ),
    db.prepare(
      `UPDATE order_item SET field_answers_json = NULL
        WHERE order_id IN (
          SELECT o.id FROM "order" o
          JOIN activity_edition ae ON ae.id = o.activity_edition_id
          WHERE ae.ends_at IS NOT NULL
            AND ae.ends_at < datetime('now', '-12 months')
        )`,
    ),
    db.prepare(
      `UPDATE "order"
          SET buyer_name = 'Dades eliminades',
              buyer_email = 'deleted+' || id || '@invalid',
              buyer_phone = NULL,
              personal_data_purged_at = datetime('now')
        WHERE personal_data_purged_at IS NULL
          AND activity_edition_id IN (
            SELECT id FROM activity_edition
             WHERE ends_at IS NOT NULL
               AND ends_at < datetime('now', '-12 months')
          )`,
    ),
  ]);

  const [{ results: activityMedia }, { results: departmentMedia }, { results: galleryMedia }] =
    await Promise.all([
      db.prepare(`SELECT poster_url, size_guide_image_url FROM activity`).all<{
        poster_url: string | null;
        size_guide_image_url: string | null;
      }>(),
      db.prepare(`SELECT photo_url FROM department`).all<{ photo_url: string | null }>(),
      db.prepare(`SELECT image_url FROM activity_image`).all<{ image_url: string }>(),
    ]);
  const referenced = new Set<string>();
  for (const row of activityMedia) {
    if (row.poster_url) referenced.add(row.poster_url);
    if (row.size_guide_image_url) referenced.add(row.size_guide_image_url);
  }
  for (const row of departmentMedia) if (row.photo_url) referenced.add(row.photo_url);
  for (const row of galleryMedia) referenced.add(row.image_url);
  const orphanedMedia = await deleteOrphanedMedia(
    referenced,
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );

  return NextResponse.json({
    ok: true,
    changes: results.map((result) => result.meta.changes ?? 0),
    orphanedMedia,
  });
}
