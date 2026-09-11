import { getDb } from "@/lib/db";
import {
  AVAIL_EXPR,
  BUYABLE_AVAIL_EXPR,
  ON_SALE_EXPR,
} from "@/lib/availability";

// A variant is "available" when it is inside its sale window and has stock
// left once open Stripe holds are accounted for. Repeated in a few queries;
// kept as one SQL fragment for consistency.
const AVAILABLE = `
  ${ON_SALE_EXPR}
  AND ${AVAIL_EXPR} > 0
`;

// Below this remaining count we flag "últimes places".
export const LAST_PLACES_THRESHOLD = 10;

export interface DepartmentTile {
  id: string;
  slug: string;
  name_ca: string;
  name_es: string | null;
  name_en: string | null;
  photo_url: string | null;
  open_count: number; // published activities with at least one available variant
}

export interface OnSaleItem {
  slug: string;
  type: string;
  title_ca: string;
  title_es: string | null;
  title_en: string | null;
}

export interface DeptActivity {
  id: string;
  slug: string;
  type: string;
  title_ca: string;
  title_es: string | null;
  title_en: string | null;
  starts_at: string | null;
  location: string | null;
  min_price: number | null;
  avail: number;
}

export interface DepartmentPage {
  department: {
    id: string;
    slug: string;
    name_ca: string;
    name_es: string | null;
    name_en: string | null;
    photo_url: string | null;
  };
  activities: DeptActivity[];
}

export interface Variant {
  id: string;
  name_ca: string;
  name_es: string | null;
  name_en: string | null;
  price_cents: number;
  avail: number;
}

export interface Field {
  id: string;
  label_ca: string;
  label_es: string | null;
  label_en: string | null;
  type: string;
  options_json: string | null;
  required: number;
  data_classification: "standard" | "identity" | "health";
}

export interface ActivityImage {
  id: string;
  image_url: string;
  alt_ca: string | null;
  position: number;
}

export interface SizeGuideRow {
  size: string;
  width_cm: number;
  length_cm: number;
}

export interface ActivityPage {
  activity: {
    id: string;
    edition_id: string;
    slug: string;
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
    max_per_order: number | null;
    size_guide_json: string | null;
    size_guide_image_url: string | null;
    dept_slug: string;
    dept_name_ca: string;
    dept_name_es: string | null;
    dept_name_en: string | null;
  };
  variants: Variant[];
  fields: Field[];
  images: ActivityImage[];
  sizeGuide: SizeGuideRow[];
}

/** Home: every department, with a count of its currently-open activities. */
export async function listDepartments(): Promise<DepartmentTile[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT d.id, d.slug, d.name_ca, d.name_es, d.name_en, d.photo_url,
        (SELECT COUNT(DISTINCT a.id)
           FROM activity a
           JOIN activity_edition ae ON ae.id = a.current_edition_id
           JOIN variant v ON v.edition_id = ae.id
          WHERE a.department_id = d.id AND ae.published = 1
            AND ae.ends_at IS NOT NULL AND a.archived = 0 AND ${AVAILABLE}
        ) AS open_count
       FROM department d
       ORDER BY d.position, d.name_ca`,
    )
    .all<DepartmentTile>();
  return results;
}

/** Home strip: activities on sale right now, across all departments. */
export async function listOnSale(): Promise<OnSaleItem[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT DISTINCT a.slug, a.type, a.title_ca, a.title_es, a.title_en
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
         JOIN variant v ON v.edition_id = ae.id
        WHERE ae.published = 1 AND ae.ends_at IS NOT NULL
          AND a.archived = 0 AND ${AVAILABLE}
        ORDER BY (ae.starts_at IS NULL), ae.starts_at, a.title_ca`,
    )
    .all<OnSaleItem>();
  return results;
}

/** Department page: the department plus its published activities. */
export async function getDepartmentBySlug(
  slug: string,
): Promise<DepartmentPage | null> {
  const db = await getDb();
  const department = await db
    .prepare(
      `SELECT id, slug, name_ca, name_es, name_en, photo_url
         FROM department WHERE slug = ?`,
    )
    .bind(slug)
    .first<DepartmentPage["department"]>();
  if (!department) return null;

  const { results: activities } = await db
    .prepare(
      `SELECT a.id, a.slug, a.type, a.title_ca, a.title_es, a.title_en,
              ae.starts_at, ae.location,
              MIN(CASE WHEN ${ON_SALE_EXPR} THEN v.price_cents END) AS min_price,
              COALESCE(SUM(${BUYABLE_AVAIL_EXPR}), 0) AS avail
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
         LEFT JOIN variant v ON v.edition_id = ae.id
        WHERE a.department_id = ? AND ae.published = 1
          AND ae.ends_at IS NOT NULL AND a.archived = 0
        GROUP BY a.id
        ORDER BY (ae.starts_at IS NULL), ae.starts_at, a.title_ca`,
    )
    .bind(department.id)
    .all<DeptActivity>();

  return { department, activities };
}

export interface TicketPage {
  ticket_code: string;
  quantity: number;
  checked_in_at: string | null;
  order_status: string;
  dispute_status: string;
  buyer_name: string;
  variant_name_ca: string;
  variant_name_es: string | null;
  variant_name_en: string | null;
  activity_slug: string;
  activity_title_ca: string;
  activity_title_es: string | null;
  activity_title_en: string | null;
}

/** Buyer-facing ticket lookup for /t/{code} — the QR lives here. */
export async function getTicketByCode(code: string): Promise<TicketPage | null> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT oi.ticket_code, oi.quantity, oi.checked_in_at,
              o.status AS order_status, o.dispute_status, o.buyer_name,
              COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name_ca,
              v.name_es AS variant_name_es, v.name_en AS variant_name_en,
              a.slug AS activity_slug,
              a.title_ca AS activity_title_ca, a.title_es AS activity_title_es, a.title_en AS activity_title_en
         FROM order_item oi
         JOIN "order" o ON o.id = oi.order_id
         JOIN variant v ON v.id = oi.variant_id
         JOIN activity a ON a.id = o.activity_id
        WHERE oi.ticket_code = ?`,
    )
    .bind(code.trim().toUpperCase())
    .first<TicketPage>();
}

export interface OrderReceipt {
  id: string;
  status: string;
  dispute_status: string;
  buyer_name: string;
  activity_slug: string;
  activity_title_ca: string;
  activity_title_es: string | null;
  activity_title_en: string | null;
  items: Array<{
    ticket_code: string;
    quantity: number;
    checked_in_at: string | null;
    variant_name_ca: string;
    variant_name_es: string | null;
    variant_name_en: string | null;
  }>;
}

/** Buyer-facing receipt hub for /o/{id} — links out to each ticket. */
export async function getOrderReceipt(orderId: string): Promise<OrderReceipt | null> {
  const db = await getDb();
  const order = await db
    .prepare(
      `SELECT o.id, o.status, o.dispute_status, o.buyer_name, a.slug AS activity_slug,
              a.title_ca AS activity_title_ca, a.title_es AS activity_title_es, a.title_en AS activity_title_en
         FROM "order" o JOIN activity a ON a.id = o.activity_id
        WHERE o.id = ?`,
    )
    .bind(orderId)
    .first<Omit<OrderReceipt, "items">>();
  if (!order) return null;

  const { results: items } = await db
    .prepare(
      `SELECT oi.ticket_code, oi.quantity, oi.checked_in_at,
              COALESCE(oi.variant_name_snapshot, v.name_ca) AS variant_name_ca,
              v.name_es AS variant_name_es, v.name_en AS variant_name_en
         FROM order_item oi JOIN variant v ON v.id = oi.variant_id
        WHERE oi.order_id = ?`,
    )
    .bind(orderId)
    .all<OrderReceipt["items"][number]>();

  return { ...order, items };
}

/** Activity page: the activity, its department, variants and custom fields. */
export async function getActivityBySlug(
  slug: string,
): Promise<ActivityPage | null> {
  const db = await getDb();
  const activity = await db
    .prepare(
      `SELECT a.id, ae.id AS edition_id, a.slug, a.type,
              a.title_ca, a.title_es, a.title_en,
              a.description_ca, a.description_es, a.description_en,
              a.poster_url, ae.starts_at, ae.location, ae.label AS edition,
              ae.max_per_order,
              a.size_guide_json, a.size_guide_image_url,
              d.slug AS dept_slug,
              d.name_ca AS dept_name_ca, d.name_es AS dept_name_es, d.name_en AS dept_name_en
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
         JOIN department d ON d.id = a.department_id
        WHERE a.slug = ? AND ae.published = 1
          AND ae.ends_at IS NOT NULL AND a.archived = 0`,
    )
    .bind(slug)
    .first<ActivityPage["activity"]>();
  if (!activity) return null;

  const [{ results: variants }, { results: fields }, { results: images }] =
    await Promise.all([
      db
        .prepare(
          `SELECT v.id, v.name_ca, v.name_es, v.name_en, v.price_cents,
                  ${BUYABLE_AVAIL_EXPR} AS avail
             FROM variant v WHERE v.edition_id = ? AND v.active = 1
            ORDER BY v.position, v.name_ca`,
        )
        .bind(activity.edition_id)
        .all<Variant>(),
      db
        .prepare(
          `SELECT id, label_ca, label_es, label_en, type, options_json, required,
                  data_classification
             FROM field WHERE activity_id = ?
            ORDER BY position`,
        )
        .bind(activity.id)
        .all<Field>(),
      db
        .prepare(
          `SELECT id, image_url, alt_ca, position
             FROM activity_image WHERE activity_id = ? ORDER BY position`,
        )
        .bind(activity.id)
        .all<ActivityImage>(),
    ]);

  let sizeGuide: SizeGuideRow[] = [];
  try {
    const parsed = JSON.parse(activity.size_guide_json ?? "[]");
    if (Array.isArray(parsed)) sizeGuide = parsed;
  } catch {
    sizeGuide = [];
  }

  return { activity, variants, fields, images, sizeGuide };
}
