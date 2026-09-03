import { getDb } from "@/lib/db";
import { AVAIL_EXPR } from "@/lib/availability";

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
              a.starts_at, a.edition, a.published, a.archived,
              (SELECT COUNT(*) FROM "order" o WHERE o.activity_id = a.id) AS order_count
         FROM activity a JOIN department d ON d.id = a.department_id
        ORDER BY a.archived, a.published DESC, (a.starts_at IS NULL), a.starts_at DESC, a.title_ca`,
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
}

export interface AdminActivityDetail {
  id: string;
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
  location: string | null;
  edition: string | null;
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
      `SELECT a.*, (SELECT COUNT(*) FROM "order" o WHERE o.activity_id = a.id) AS order_count
         FROM activity a WHERE a.id = ?`,
    )
    .bind(id)
    .first<AdminActivityDetail>();
  if (!activity) return null;

  const [{ results: variants }, { results: fields }, { results: images }] = await Promise.all([
    db
      .prepare(
        `SELECT id, name_ca, name_es, name_en, price_cents, stock, sold,
                sale_start, sale_end, position
           FROM variant WHERE activity_id = ? ORDER BY position`,
      )
      .bind(id)
      .all<AdminVariant>(),
    db
      .prepare(
        `SELECT id, position, label_ca, label_es, label_en, type, options_json, required
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
  }>;
}

export async function getSales(
  slug: string,
  edition?: string,
): Promise<SalesSummary | null> {
  const db = await getDb();
  const activity = await db
    .prepare(`SELECT id, slug, title_ca, type, edition FROM activity WHERE slug = ?`)
    .bind(slug)
    .first<{ id: string; slug: string; title_ca: string; type: string; edition: string | null }>();
  if (!activity) return null;

  const { results: editionRows } = await db
    .prepare(
      `SELECT DISTINCT edition FROM "order" WHERE activity_id = ? AND edition IS NOT NULL
        ORDER BY edition DESC`,
    )
    .bind(activity.id)
    .all<{ edition: string }>();
  const editions = editionRows.map((r) => r.edition);
  const currentEdition = edition ?? activity.edition ?? editions[0] ?? null;

  const editionFilter = currentEdition ? `AND o.edition = ?` : `AND o.edition IS NULL`;
  const bind = currentEdition ? [activity.id, currentEdition] : [activity.id];

  // Revenue is summed from "order" directly (one row per order) — joining in
  // order_item first would duplicate o.total_cents once per line item on
  // any multi-ticket order.
  const totals = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(oi.quantity), 0)
            FROM order_item oi JOIN "order" o ON o.id = oi.order_id
           WHERE o.activity_id = ? ${editionFilter} AND o.status = 'paid') AS sold,
         (SELECT COALESCE(SUM(o.total_cents), 0)
            FROM "order" o
           WHERE o.activity_id = ? ${editionFilter} AND o.status = 'paid') AS revenue_cents`,
    )
    .bind(...bind, ...bind)
    .first<{ sold: number; revenue_cents: number }>();

  const remainingRow = await db
    .prepare(
      `SELECT COALESCE(SUM(${AVAIL_EXPR}), 0) AS remaining
         FROM variant v WHERE v.activity_id = ?`,
    )
    .bind(activity.id)
    .first<{ remaining: number }>();

  const { results: buyers } = await db
    .prepare(
      `SELECT o.id AS order_id, o.buyer_name, o.buyer_email, o.status, o.payment_method,
              o.created_at, v.name_ca AS variant_name, oi.quantity, oi.ticket_code, oi.checked_in_at
         FROM "order" o
         JOIN order_item oi ON oi.order_id = o.id
         JOIN variant v ON v.id = oi.variant_id
        WHERE o.activity_id = ? ${editionFilter}
        ORDER BY o.created_at DESC`,
    )
    .bind(...bind)
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
// Excel export — full manifest, columns adapt to the activity's Fields.
// Convention: order_item.field_answers_json is a JSON object keyed by
// field.id, {"fld_xxx": "answer"}, written by the checkout flow (step 5/6).
// ---------------------------------------------------------------------------

export interface ExportRow {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  variant_name: string;
  quantity: number;
  ticket_code: string;
  status: string;
  checked_in_at: string | null;
  created_at: string;
  field_answers_json: string | null;
}

export async function getSalesExport(
  slug: string,
  edition?: string,
): Promise<{
  activity: { title_ca: string };
  fields: Array<{ id: string; label_ca: string }>;
  rows: ExportRow[];
} | null> {
  const db = await getDb();
  const activity = await db
    .prepare(`SELECT id, title_ca, edition FROM activity WHERE slug = ?`)
    .bind(slug)
    .first<{ id: string; title_ca: string; edition: string | null }>();
  if (!activity) return null;

  const { results: fields } = await db
    .prepare(`SELECT id, label_ca FROM field WHERE activity_id = ? ORDER BY position`)
    .bind(activity.id)
    .all<{ id: string; label_ca: string }>();

  const useEdition = edition ?? activity.edition;
  const editionFilter = useEdition ? `AND o.edition = ?` : `AND o.edition IS NULL`;
  const bind = useEdition ? [activity.id, useEdition] : [activity.id];

  const { results: rows } = await db
    .prepare(
      `SELECT o.buyer_name, o.buyer_email, o.buyer_phone, v.name_ca AS variant_name,
              oi.quantity, oi.ticket_code, o.status, oi.checked_in_at, o.created_at,
              oi.field_answers_json
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
        WHERE o.activity_id = ? ${editionFilter}
        ORDER BY o.created_at`,
    )
    .bind(...bind)
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
}

export async function findTicket(code: string): Promise<TicketLookup | null> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.ticket_code, oi.checked_in_at, oi.quantity,
              v.name_ca AS variant_name, a.title_ca AS activity_title,
              o.buyer_name, o.status AS order_status
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
