import { getDb } from "@/lib/db";
import { AVAIL_EXPR, SOLD_FROM_ORDERS } from "@/lib/availability";

// Admin-facing reads: unlike src/lib/queries.ts these ignore `published` and
// sale windows — admins need to see and edit everything, live or not.

export interface AdminDepartment {
  id: string;
  slug: string;
  position: number;
  name_ca: string;
  name_es: string | null;
  name_en: string | null;
  photo_url: string | null;
}

export async function listAllDepartments(): Promise<AdminDepartment[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT id, slug, position, name_ca, name_es, name_en, photo_url
         FROM department ORDER BY position, name_ca`,
    )
    .all<AdminDepartment>();
  return results;
}

export interface AdminActivityRow {
  id: string;
  slug: string;
  type: string;
  title_ca: string;
  dept_name_ca: string;
  starts_at: string | null;
  ends_at: string | null;
  edition: string | null;
  published: number;
  archived: number;
  order_count: number;
}

export async function listAllActivities(): Promise<AdminActivityRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT a.id, a.slug, a.type, a.title_ca, d.name_ca AS dept_name_ca,
              ae.starts_at, ae.ends_at, ae.label AS edition, ae.published, a.archived,
              (SELECT COUNT(*) FROM "order" o WHERE o.activity_id = a.id) AS order_count
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
         JOIN department d ON d.id = a.department_id
        ORDER BY a.archived, ae.published DESC, (ae.starts_at IS NULL), ae.starts_at DESC, a.title_ca`,
    )
    .all<AdminActivityRow>();
  return results;
}

export interface AdminVariant {
  id: string;
  name_ca: string;
  name_es: string | null;
  name_en: string | null;
  price_cents: number;
  stock: number;
  sold: number;
  sale_start: string | null;
  sale_end: string | null;
  position: number;
}

export interface AdminField {
  id: string;
  position: number;
  label_ca: string;
  label_es: string | null;
  label_en: string | null;
  type: string;
  options_json: string | null;
  required: number;
  data_classification: "standard" | "identity" | "health";
}

export interface AdminActivityDetail {
  id: string;
  edition_id: string;
  slug: string;
  department_id: string;
  type: string;
  title_ca: string;
  title_es: string | null;
  title_en: string | null;
  description_ca: string | null;
  description_es: string | null;
  description_en: string | null;
  poster_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  edition: string | null;
  max_per_order: number | null;
  published: number;
  archived: number;
  size_guide_json: string | null;
  size_guide_image_url: string | null;
  order_count: number;
}

export interface AdminActivityImage {
  id: string;
  image_url: string;
  alt_ca: string | null;
  position: number;
}

export async function getAdminActivity(id: string): Promise<{
  activity: AdminActivityDetail;
  variants: AdminVariant[];
  fields: AdminField[];
  images: AdminActivityImage[];
} | null> {
  const db = await getDb();
  const activity = await db
    .prepare(
      `SELECT a.id, a.slug, a.department_id, a.type,
              a.title_ca, a.title_es, a.title_en,
              a.description_ca, a.description_es, a.description_en,
              a.poster_url, a.archived, a.size_guide_json,
              a.size_guide_image_url, ae.id AS edition_id,
              ae.starts_at, ae.ends_at, ae.location, ae.label AS edition,
              ae.max_per_order, ae.published,
              (SELECT COUNT(*) FROM "order" o WHERE o.activity_id = a.id) AS order_count
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
        WHERE a.id = ?`,
    )
    .bind(id)
    .first<AdminActivityDetail>();
  if (!activity) return null;

  const [{ results: variants }, { results: fields }, { results: images }] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.name_ca, v.name_es, v.name_en, v.price_cents, v.stock,
                ${SOLD_FROM_ORDERS} AS sold,
                sale_start, sale_end, position
           FROM variant v WHERE v.edition_id = ? AND v.active = 1 ORDER BY position`,
      )
      .bind(activity.edition_id)
      .all<AdminVariant>(),
    db
      .prepare(
        `SELECT id, position, label_ca, label_es, label_en, type, options_json, required,
                data_classification
           FROM field WHERE activity_id = ? ORDER BY position`,
      )
      .bind(id)
      .all<AdminField>(),
    db
      .prepare(
        `SELECT id, image_url, alt_ca, position
           FROM activity_image WHERE activity_id = ? ORDER BY position`,
      )
      .bind(id)
      .all<AdminActivityImage>(),
  ]);

  return { activity, variants, fields, images };
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SalesSummary {
  activity: { id: string; slug: string; title_ca: string; type: string };
  editions: string[];
  currentEdition: string | null;
  sold: number;
  revenue_cents: number;
  remaining: number;
  buyers: Array<{
    order_id: string;
    buyer_name: string;
    buyer_email: string;
    status: string;
    payment_method: string;
    created_at: string;
    variant_name: string;
    quantity: number;
    ticket_code: string;
    checked_in_at: string | null;
    collected_at: string | null;
    relay_synced_at: string | null;
    relay_sheet_status: string;
    relay_email_status: string;
    dispute_status: string;
    refunded_cents: number;
  }>;
}

export async function getSales(
  slug: string,
  edition?: string,
): Promise<SalesSummary | null> {
  const db = await getDb();
  const activity = await db
    .prepare(`SELECT id, slug, title_ca, type, current_edition_id FROM activity WHERE slug = ?`)
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      title_ca: string;
      type: string;
      current_edition_id: string;
    }>();
  if (!activity) return null;

  const { results: editionRows } = await db
    .prepare(
      `SELECT id, label FROM activity_edition WHERE activity_id = ?
        ORDER BY created_at DESC, label DESC`,
    )
    .bind(activity.id)
    .all<{ id: string; label: string }>();
  const selected = editionRows.find((row) => row.label === edition) ??
    editionRows.find((row) => row.id === activity.current_edition_id) ?? editionRows[0];
  if (!selected) return null;
  const editions = editionRows.map((row) => row.label);
  const currentEdition = selected.label;

  // Revenue is summed from "order" directly (one row per order) — joining in
  // order_item first would duplicate o.total_cents once per line item on
  // any multi-ticket order.
  //
  // It is net of fee_cents: what the activity actually takes, not what passed
  // through the gateway. Stripe's own dashboard shows the gross, so the two
  // will differ by exactly the service fees, which is the point of storing
  // them separately.
  const totals = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(oi.quantity), 0)
            FROM order_item oi JOIN "order" o ON o.id = oi.order_id
           WHERE o.activity_edition_id = ? AND o.status = 'paid') AS sold,
         (SELECT COALESCE(SUM(MAX(o.total_cents - o.fee_cents - o.refunded_cents, 0)), 0)
            FROM "order" o
           WHERE o.activity_edition_id = ? AND o.status = 'paid') AS revenue_cents`,
    )
    .bind(selected.id, selected.id)
    .first<{ sold: number; revenue_cents: number }>();

  const remainingRow = await db
    .prepare(
      `SELECT COALESCE(SUM(${AVAIL_EXPR}), 0) AS remaining
         FROM variant v WHERE v.edition_id = ? AND v.active = 1`,
    )
    .bind(selected.id)
    .first<{ remaining: number }>();

  const { results: buyers } = await db
    .prepare(
      `SELECT o.id AS order_id, o.buyer_name, o.buyer_email, o.status, o.payment_method,
              o.created_at, COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name,
              oi.quantity, oi.ticket_code, oi.checked_in_at, oi.collected_at,
              o.relay_synced_at, o.relay_sheet_status, o.relay_email_status,
              o.dispute_status, o.refunded_cents
         FROM "order" o
         JOIN order_item oi ON oi.order_id = o.id
         JOIN variant v ON v.id = oi.variant_id
        WHERE o.activity_edition_id = ?
        ORDER BY o.created_at DESC`,
    )
    .bind(selected.id)
    .all<SalesSummary["buyers"][number]>();

  return {
    activity,
    editions,
    currentEdition,
    sold: totals?.sold ?? 0,
    revenue_cents: totals?.revenue_cents ?? 0,
    remaining: remainingRow?.remaining ?? 0,
    buyers,
  };
}

// ---------------------------------------------------------------------------
// Excel export — immutable answer snapshots keep historical manifests stable
// even when the activity's editable fields change later.
// ---------------------------------------------------------------------------

export interface ExportRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  variant_name: string;
  quantity: number;
  ticket_code: string;
  status: string;
  dispute_status: string;
  checked_in_at: string | null;
  collected_at: string | null;
  created_at: string;
  terms_accepted_at: string | null;
  terms_version: string | null;
  field_answers_json: string | null;
}

export async function getSalesExport(
  slug: string,
  edition?: string,
  includeAll = false,
): Promise<{
  activity: { title_ca: string; type: string };
  fields: Array<{ id: string; label_ca: string }>;
  rows: ExportRow[];
} | null> {
  const db = await getDb();
  const activity = await db
    .prepare(`SELECT id, title_ca, type, current_edition_id FROM activity WHERE slug = ?`)
    .bind(slug)
    .first<{
      id: string;
      title_ca: string;
      type: string;
      current_edition_id: string;
    }>();
  if (!activity) return null;

  const selectedEdition = edition
    ? await db
        .prepare(`SELECT id FROM activity_edition WHERE activity_id = ? AND label = ?`)
        .bind(activity.id, edition)
        .first<{ id: string }>()
    : { id: activity.current_edition_id };
  if (!selectedEdition) return null;

  const { results: fields } = await db
    .prepare(
      `SELECT a.field_id_snapshot || '|' || a.field_type_snapshot || '|' ||
              a.label_ca_snapshot AS id,
              MIN(a.label_ca_snapshot) AS label_ca,
              MIN(a.position) AS position
         FROM order_item_answer a
         JOIN order_item oi ON oi.id = a.order_item_id
         JOIN "order" o ON o.id = oi.order_id
        WHERE o.activity_edition_id = ? ${includeAll ? "" : "AND o.status = 'paid'"}
        GROUP BY a.field_id_snapshot, a.field_type_snapshot, a.label_ca_snapshot
        ORDER BY position`,
    )
    .bind(selectedEdition.id)
    .all<{ id: string; label_ca: string }>();

  const { results: rows } = await db
    .prepare(
      `SELECT o.buyer_name, o.buyer_email, o.buyer_phone,
              COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name,
              oi.quantity, oi.ticket_code, o.status, o.dispute_status,
              oi.checked_in_at, oi.collected_at,
              o.created_at, o.terms_accepted_at, o.terms_version,
              (SELECT json_group_object(
                        a.field_id_snapshot || '|' || a.field_type_snapshot || '|' ||
                        a.label_ca_snapshot,
                        a.value_text
                      )
                 FROM order_item_answer a
                WHERE a.order_item_id = oi.id) AS field_answers_json
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
        WHERE o.activity_edition_id = ? ${includeAll ? "" : "AND o.status = 'paid'"}
        ORDER BY o.created_at`,
    )
    .bind(selectedEdition.id)
    .all<ExportRow>();

  return { activity, fields, rows };
}

// ---------------------------------------------------------------------------
// Door (check-in) and Pickup (merch collection)
// ---------------------------------------------------------------------------

export interface TicketLookup {
  order_item_id: string;
  ticket_code: string;
  checked_in_at: string | null;
  quantity: number;
  variant_name: string;
  activity_title: string;
  buyer_name: string;
  order_status: string;
  dispute_status: string;
}

export async function findTicket(code: string): Promise<TicketLookup | null> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.ticket_code, oi.checked_in_at, oi.quantity,
              v.name_ca AS variant_name, a.title_ca AS activity_title,
              o.buyer_name, o.status AS order_status, o.dispute_status
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
         JOIN activity a ON a.id = o.activity_id
        WHERE oi.ticket_code = ?`,
    )
    .bind(code.trim().toUpperCase())
    .first<TicketLookup>();
}

export interface PickupRow {
  order_item_id: string;
  buyer_name: string;
  buyer_email: string;
  activity_title: string;
  variant_name: string;
  quantity: number;
  checked_in_at: string | null;
  collected_at: string | null;
}

export async function searchPickup(query: string): Promise<PickupRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT oi.id AS order_item_id, o.buyer_name, o.buyer_email,
              a.title_ca AS activity_title, COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name,
              oi.quantity, oi.checked_in_at, oi.collected_at
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
         JOIN activity a ON a.id = o.activity_id
        WHERE a.type = 'merch' AND o.status = 'paid' AND o.buyer_name LIKE ?
        ORDER BY o.buyer_name
        LIMIT 50`,
    )
    .bind(`%${query}%`)
    .all<PickupRow>();
  return results;
}

export interface BuyerSearchRow {
  order_item_id: string;
  ticket_code: string;
  buyer_name: string;
  buyer_email: string;
  activity_title: string;
  variant_name: string;
  quantity: number;
  order_status: string;
  checked_in_at: string | null;
}

/**
 * Find someone's codes by name or email. This is the answer to the most common
 * incident there is — a buyer at the door who never got the email, or deleted
 * it — so it lives on the Door screen where that conversation happens.
 */
export async function searchBuyers(query: string): Promise<BuyerSearchRow[]> {
  const db = await getDb();
  const like = `%${query}%`;
  const { results } = await db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.ticket_code, o.buyer_name, o.buyer_email,
              a.title_ca AS activity_title,
              COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name,
              oi.quantity, o.status AS order_status, oi.checked_in_at
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
         JOIN activity a ON a.id = o.activity_id
        WHERE o.buyer_name LIKE ? OR o.buyer_email LIKE ?
        ORDER BY o.created_at DESC
        LIMIT 50`,
    )
    .bind(like, like)
    .all<BuyerSearchRow>();
  return results;
}

export interface OperationalOverview {
  webhookIssues: Array<{
    id: string;
    type: string;
    processing_status: string;
    attempts: number;
    received_at: string;
    last_error: string | null;
  }>;
  pendingOrders: Array<{
    id: string;
    buyer_email: string;
    activity_title: string;
    stripe_session_id: string | null;
    created_at: string;
  }>;
  relayIssues: Array<{
    id: string;
    buyer_email: string;
    activity_title: string;
    activity_slug: string;
    edition: string | null;
    relay_sheet_status: string;
    relay_email_status: string;
    relay_last_error: string | null;
  }>;
}

export async function getOperationalOverview(): Promise<OperationalOverview> {
  const db = await getDb();
  const [{ results: webhookIssues }, { results: pendingOrders }, { results: relayIssues }] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, type, processing_status, attempts, received_at, last_error
             FROM stripe_event
            WHERE processing_status = 'failed'
               OR (
                 processing_status = 'processing'
                 AND processing_started_at < datetime('now', '-5 minutes')
               )
            ORDER BY received_at DESC LIMIT 100`,
        )
        .all<OperationalOverview["webhookIssues"][number]>(),
      db
        .prepare(
          `SELECT o.id, o.buyer_email, a.title_ca AS activity_title,
                  o.stripe_session_id, o.created_at
             FROM "order" o JOIN activity a ON a.id = o.activity_id
            WHERE o.status = 'pending'
              AND o.created_at < datetime('now', '-50 minutes')
            ORDER BY o.created_at LIMIT 100`,
        )
        .all<OperationalOverview["pendingOrders"][number]>(),
      db
        .prepare(
          `SELECT o.id, o.buyer_email, a.title_ca AS activity_title,
                  a.slug AS activity_slug, o.edition,
                  o.relay_sheet_status, o.relay_email_status, o.relay_last_error
             FROM "order" o JOIN activity a ON a.id = o.activity_id
            WHERE o.status = 'paid'
              AND (
                o.relay_sheet_status != 'sent'
                OR o.relay_email_status NOT IN ('sent', 'unknown')
              )
            ORDER BY o.paid_at DESC LIMIT 100`,
        )
        .all<OperationalOverview["relayIssues"][number]>(),
    ]);
  return { webhookIssues, pendingOrders, relayIssues };
}
