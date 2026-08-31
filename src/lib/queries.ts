import { getDb } from "@/lib/db";
import { HELD_BY_STRIPE, AVAIL_EXPR } from "@/lib/availability";

// A variant is "available" when it is inside its sale window and has stock
// left once open Stripe holds are accounted for. Repeated in a few queries;
// kept as one SQL fragment for consistency.
const AVAILABLE = `
  (v.sale_start IS NULL OR v.sale_start <= datetime('now'))
  AND (v.sale_end   IS NULL OR v.sale_end   >= datetime('now'))
  AND (v.stock - v.sold - ${HELD_BY_STRIPE}) > 0
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
}

export interface ActivityPage {
  activity: {
    id: string;
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
    dept_slug: string;
    dept_name_ca: string;
    dept_name_es: string | null;
    dept_name_en: string | null;
  };
  variants: Variant[];
  fields: Field[];
}

/** Home: every department, with a count of its currently-open activities. */
export async function listDepartments(): Promise<DepartmentTile[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT d.id, d.slug, d.name_ca, d.name_es, d.name_en, d.photo_url,
        (SELECT COUNT(DISTINCT a.id)
           FROM activity a JOIN variant v ON v.activity_id = a.id
          WHERE a.department_id = d.id AND a.published = 1 AND ${AVAILABLE}
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
         FROM activity a JOIN variant v ON v.activity_id = a.id
        WHERE a.published = 1 AND ${AVAILABLE}
        ORDER BY (a.starts_at IS NULL), a.starts_at, a.title_ca`,
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
              a.starts_at, a.location,
              MIN(v.price_cents) AS min_price,
              COALESCE(SUM(${AVAIL_EXPR}), 0) AS avail
         FROM activity a LEFT JOIN variant v ON v.activity_id = a.id
        WHERE a.department_id = ? AND a.published = 1
        GROUP BY a.id
        ORDER BY (a.starts_at IS NULL), a.starts_at, a.title_ca`,
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
              o.status AS order_status, o.buyer_name,
              v.name_ca AS variant_name_ca, v.name_es AS variant_name_es, v.name_en AS variant_name_en,
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
      `SELECT o.id, o.status, o.buyer_name, a.slug AS activity_slug,
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
              v.name_ca AS variant_name_ca, v.name_es AS variant_name_es, v.name_en AS variant_name_en
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
      `SELECT a.id, a.slug, a.type,
              a.title_ca, a.title_es, a.title_en,
              a.description_ca, a.description_es, a.description_en,
              a.poster_url, a.starts_at, a.location, a.edition,
              d.slug AS dept_slug,
              d.name_ca AS dept_name_ca, d.name_es AS dept_name_es, d.name_en AS dept_name_en
         FROM activity a JOIN department d ON d.id = a.department_id
        WHERE a.slug = ? AND a.published = 1`,
    )
    .bind(slug)
    .first<ActivityPage["activity"]>();
  if (!activity) return null;

  const { results: variants } = await db
    .prepare(
      `SELECT v.id, v.name_ca, v.name_es, v.name_en, v.price_cents,
              ${AVAIL_EXPR} AS avail
         FROM variant v WHERE v.activity_id = ?
        ORDER BY v.position, v.name_ca`,
    )
    .bind(activity.id)
    .all<Variant>();

  const { results: fields } = await db
    .prepare(
      `SELECT id, label_ca, label_es, label_en, type, options_json, required
         FROM field WHERE activity_id = ?
        ORDER BY position`,
    )
    .bind(activity.id)
    .all<Field>();

  return { activity, variants, fields };
}
