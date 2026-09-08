"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { saveMedia } from "@/lib/storage";
import { getStripe } from "@/lib/stripe";
import { wallTimeToUtc } from "@/lib/time";
import { eurosToCents } from "@/lib/admin/money";
import type { VariantDraft, FieldDraft } from "@/lib/admin/activityForm";
import type {
  ActivityImageDraft,
  SizeGuideRowDraft,
} from "@/lib/admin/activityForm";

export type ActionState = { error?: string } | null;

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function maxPerOrder(v: FormDataEntryValue | null): number | null {
  const raw = str(v);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseVariants(json: string): VariantDraft[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseFields(json: string): FieldDraft[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseImages(json: string): ActivityImageDraft[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSizeGuide(json: string): SizeGuideRowDraft[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedSizeGuide(rows: SizeGuideRowDraft[]): {
  value: string | null;
  error?: string;
} {
  const complete = rows.filter(
    (row) => row.size.trim() || row.width_cm.trim() || row.length_cm.trim(),
  );
  const normalized = complete.map((row) => ({
    size: row.size.trim(),
    width_cm: Number(row.width_cm.replace(",", ".")),
    length_cm: Number(row.length_cm.replace(",", ".")),
  }));
  if (
    normalized.some(
      (row) =>
        !row.size ||
        !Number.isFinite(row.width_cm) ||
        row.width_cm <= 0 ||
        !Number.isFinite(row.length_cm) ||
        row.length_cm <= 0,
    )
  ) {
    return { value: null, error: "Completa cada talla amb amplada i llargada positives." };
  }
  return { value: normalized.length ? JSON.stringify(normalized) : null };
}

function imageFiles(formData: FormData, name: string): File[] {
  return formData
    .getAll(name)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function validateImages(files: File[]): string | null {
  if (files.some((file) => !file.type.startsWith("image/"))) {
    return "Només es poden pujar fitxers d'imatge.";
  }
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    return "Cada imatge ha de pesar menys de 10 MB.";
  }
  if (files.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) {
    return "El conjunt d'imatges ha de pesar menys de 24 MB.";
  }
  return null;
}

function toDatetime(v: string): string | null {
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" with no zone — it
  // means "this time in Girona". Stored as UTC so the sale-window comparisons
  // against SQLite's datetime('now') (also UTC) line up. See src/lib/time.ts.
  return wallTimeToUtc(v);
}

type StatementPlan =
  | { statements: D1PreparedStatement[] }
  | { error: string };

type CatalogPlan =
  | {
      statements: D1PreparedStatement[];
      /**
       * Whether this edit changes something a Checkout Session already holds a
       * snapshot of — a price, or a modality disappearing. Fixing a typo in the
       * description is not worth throwing every buyer out of Stripe for.
       */
      affectsOpenCheckouts: boolean;
    }
  | { error: string };

async function prepareVariantsAndFields(
  db: D1Database,
  activityId: string,
  variants: VariantDraft[],
  fields: FieldDraft[],
): Promise<CatalogPlan> {
  const validVariants = variants.filter((v) => v.name_ca.trim() !== "");
  if (validVariants.length === 0) {
    return { error: "Cal almenys una modalitat (variant)." };
  }

  const pricedVariants: Array<{ draft: VariantDraft; priceCents: number }> = [];
  for (const variant of validVariants) {
    const priceCents = eurosToCents(variant.price_euros);
    if (priceCents === null) {
      return {
        error: `El preu de «${variant.name_ca}» no és vàlid. Escriu, per exemple, 12,50.`,
      };
    }
    pricedVariants.push({ draft: variant, priceCents });
  }

  const [{ results: existingVariants }, { results: existingFields }] = await Promise.all([
    db
      .prepare(`SELECT id, price_cents FROM variant WHERE activity_id = ? AND active = 1`)
      .bind(activityId)
      .all<{ id: string; price_cents: number }>(),
    db
      .prepare(`SELECT id FROM field WHERE activity_id = ?`)
      .bind(activityId)
      .all<{ id: string }>(),
  ]);

  const existingVariantIds = new Set(existingVariants.map((variant) => variant.id));
  const unknownVariant = validVariants.find(
    (variant) => variant.id && !existingVariantIds.has(variant.id),
  );
  if (unknownVariant) return { error: "Una modalitat ja no pertany a aquesta activitat." };

  const existingFieldIds = new Set(existingFields.map((field) => field.id));
  const unknownField = fields.find((field) => field.id && !existingFieldIds.has(field.id));
  if (unknownField) return { error: "Una pregunta ja no pertany a aquesta activitat." };

  const keptIds = new Set(validVariants.filter((v) => v.id).map((v) => v.id));
  const removed = existingVariants.filter((v) => !keptIds.has(v.id));
  const keptFieldIds = new Set(fields.filter((f) => f.id).map((f) => f.id));
  const removedFields = existingFields.filter((f) => !keptFieldIds.has(f.id));

  const statements: D1PreparedStatement[] = [];

  for (const v of removed) {
    // Preserve historical orders while making the variant unavailable to all
    // new buyers. Physical deletion would violate order_item's foreign key.
    statements.push(
      db
        .prepare(`UPDATE variant SET active = 0 WHERE id = ? AND activity_id = ?`)
        .bind(v.id, activityId),
    );
  }
  for (const f of removedFields) {
    statements.push(db.prepare(`DELETE FROM field WHERE id = ?`).bind(f.id));
  }

  pricedVariants.forEach(({ draft: v, priceCents }, position) => {
    const stock = Math.max(0, Number.parseInt(v.stock, 10) || 0);
    if (v.id) {
      statements.push(
        db
          .prepare(
            `UPDATE variant SET name_ca=?, name_es=?, name_en=?, price_cents=?, stock=?,
                    sale_start=?, sale_end=?, position=?, active=1
              WHERE id=? AND activity_id=?`,
          )
          .bind(
            v.name_ca,
            v.name_es || null,
            v.name_en || null,
            priceCents,
            stock,
            toDatetime(v.sale_start),
            toDatetime(v.sale_end),
            position,
            v.id,
            activityId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO variant (id, activity_id, name_ca, name_es, name_en, price_cents, stock, sale_start, sale_end, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId("var"),
            activityId,
            v.name_ca,
            v.name_es || null,
            v.name_en || null,
            priceCents,
            stock,
            toDatetime(v.sale_start),
            toDatetime(v.sale_end),
            position,
          ),
      );
    }
  });

  fields.forEach((f, position) => {
    const options =
      (f.type === "select" || f.type === "checkbox") && f.options.trim()
        ? JSON.stringify(
            f.options
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean),
          )
        : null;
    if (f.id) {
      statements.push(
        db
          .prepare(
            `UPDATE field SET label_ca=?, label_es=?, label_en=?, type=?, options_json=?, required=?, position=?
              WHERE id=? AND activity_id=?`,
          )
          .bind(
            f.label_ca,
            f.label_es || null,
            f.label_en || null,
            f.type,
            options,
            f.required ? 1 : 0,
            position,
            f.id,
            activityId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO field (id, activity_id, position, label_ca, label_es, label_en, type, options_json, required)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId("fld"),
            activityId,
            position,
            f.label_ca,
            f.label_es || null,
            f.label_en || null,
            f.type,
            options,
            f.required ? 1 : 0,
          ),
      );
    }
  });

  // A session's line items carry the price the buyer agreed to. Only a price
  // that moved, or a modality that went away, can make that snapshot wrong.
  const priceOf = new Map(existingVariants.map((v) => [v.id, v.price_cents]));
  const affectsOpenCheckouts =
    removed.length > 0 ||
    pricedVariants.some(
      ({ draft, priceCents }) => draft.id && priceOf.get(draft.id) !== priceCents,
    );

  return { statements, affectsOpenCheckouts };
}

/**
 * A Stripe Checkout Session contains a snapshot of its line items. Expire all
 * open sessions before an edit so an old price cannot be paid afterwards.
 */
async function preparePendingCheckoutCancellation(
  db: D1Database,
  activityId: string,
): Promise<StatementPlan> {
  const { results: pending } = await db
    .prepare(
      `SELECT id, stripe_session_id
         FROM "order"
        WHERE activity_id = ? AND status = 'pending' AND stripe_session_id IS NOT NULL`,
    )
    .bind(activityId)
    .all<{ id: string; stripe_session_id: string }>();
  if (pending.length === 0) return { statements: [] };

  let stripe;
  try {
    stripe = await getStripe();
  } catch (error) {
    console.error("[admin] Could not initialise Stripe while updating activity", {
      activityId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { error: "No s'han pogut tancar les compres obertes. Torna-ho a provar." };
  }

  const expiredOrders: typeof pending = [];
  for (const order of pending) {
    let status: string | null;
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      status = session.status;
      if (status === "open") {
        try {
          await stripe.checkout.sessions.expire(order.stripe_session_id);
          status = "expired";
        } catch {
          // The buyer may complete payment between retrieve and expire.
          status = (await stripe.checkout.sessions.retrieve(order.stripe_session_id)).status;
        }
      }
    } catch (error) {
      console.error("[admin] Could not expire Stripe Checkout", {
        activityId,
        orderId: order.id,
        sessionId: order.stripe_session_id,
        message: error instanceof Error ? error.message : String(error),
      });
      return { error: "No s'han pogut tancar les compres obertes. Torna-ho a provar." };
    }

    // A completed session is already a committed payment attempt (Bizum may
    // still be asynchronous). Keep its immutable order snapshot and let the
    // webhook finish it; only sessions that were still open are invalidated.
    if (status === "complete") continue;
    if (status !== "expired") {
      return { error: "No s'ha pogut comprovar una compra oberta. Torna-ho a provar." };
    }
    expiredOrders.push(order);
  }

  const statements: D1PreparedStatement[] = [];
  for (const order of expiredOrders) {
    statements.push(
      db
        .prepare(
          `UPDATE "order" SET status = 'cancelled'
            WHERE id = ? AND stripe_session_id = ? AND status = 'pending'`,
        )
        .bind(order.id, order.stripe_session_id),
      db
        .prepare(
          `UPDATE stock_reservation SET expires_at = datetime('now')
            WHERE order_id = ? AND consumed_at IS NULL`,
        )
        .bind(order.id),
    );
  }
  return { statements };
}

export async function createActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const titleCa = str(formData.get("title_ca"));
  const departmentId = str(formData.get("department_id"));
  const type = str(formData.get("type"));
  if (!titleCa || !departmentId || !type) {
    return { error: "Departament, tipus i títol (CA) són obligatoris." };
  }

  const sizeGuide = normalizedSizeGuide(
    parseSizeGuide(String(formData.get("size_guide_json") ?? "[]")),
  );
  if (sizeGuide.error) return { error: sizeGuide.error };
  const galleryFiles = imageFiles(formData, "gallery");
  const guideFiles = imageFiles(formData, "size_guide_image");
  const posterFiles = imageFiles(formData, "poster");
  const mediaError = validateImages([
    ...galleryFiles,
    ...guideFiles,
    ...posterFiles,
  ]);
  if (mediaError) return { error: mediaError };

  const db = await getDb();
  const baseSlug = slugify(titleCa);
  let slug = baseSlug;
  for (let i = 2; await db.prepare(`SELECT 1 FROM activity WHERE slug=?`).bind(slug).first(); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const id = newId("act");
  const variants = parseVariants(String(formData.get("variants_json") ?? "[]"));
  const fields = parseFields(String(formData.get("fields_json") ?? "[]"));
  const catalog = await prepareVariantsAndFields(db, id, variants, fields);
  if ("error" in catalog) return { error: catalog.error };

  const posterUrl = posterFiles[0]
    ? await saveMedia("activities", posterFiles[0])
    : null;
  const sizeGuideImageUrl = type === "merch" && guideFiles[0]
    ? await saveMedia("size-guides", guideFiles[0])
    : null;
  const uploadedGallery = await Promise.all(
    galleryFiles.map((file) => saveMedia("activity-galleries", file)),
  );

  const activityStatement = db
    .prepare(
      `INSERT INTO activity
        (id, slug, department_id, type, title_ca, title_es, title_en,
         description_ca, description_es, description_en,
         poster_url, starts_at, location, edition, max_per_order, published,
         size_guide_json, size_guide_image_url, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      id,
      slug,
      departmentId,
      type,
      titleCa,
      str(formData.get("title_es")),
      str(formData.get("title_en")),
      str(formData.get("description_ca")),
      str(formData.get("description_es")),
      str(formData.get("description_en")),
      posterUrl,
      toDatetime(str(formData.get("starts_at")) ?? ""),
      str(formData.get("location")),
      str(formData.get("edition")),
      maxPerOrder(formData.get("max_per_order")),
      formData.get("published") ? 1 : 0,
      type === "merch" ? sizeGuide.value : null,
      type === "merch" ? sizeGuideImageUrl : null,
    );
  const galleryStatements = uploadedGallery.map((imageUrl, position) =>
    db
      .prepare(
        `INSERT INTO activity_image (id, activity_id, image_url, alt_ca, position)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(newId("img"), id, imageUrl, titleCa, position),
  );

  // D1 batches are transactional: either the activity and all its editable
  // children are created, or none of them are.
  await db.batch([activityStatement, ...catalog.statements, ...galleryStatements]);

  revalidatePath("/admin/activities");
  redirect(`/admin/activities/${id}`);
}

export async function updateActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = str(formData.get("id"));
  const titleCa = str(formData.get("title_ca"));
  const departmentId = str(formData.get("department_id"));
  if (!id || !titleCa || !departmentId) {
    return { error: "Departament i títol (CA) són obligatoris." };
  }

  const type = str(formData.get("type"));
  const sizeGuide = normalizedSizeGuide(
    parseSizeGuide(String(formData.get("size_guide_json") ?? "[]")),
  );
  if (sizeGuide.error) return { error: sizeGuide.error };
  const galleryFiles = imageFiles(formData, "gallery");
  const guideFiles = imageFiles(formData, "size_guide_image");
  const posterFiles = imageFiles(formData, "poster");
  const mediaError = validateImages([...galleryFiles, ...guideFiles, ...posterFiles]);
  if (mediaError) return { error: mediaError };

  const db = await getDb();
  const current = await db
    .prepare(
      `SELECT poster_url, size_guide_image_url, archived FROM activity WHERE id = ?`,
    )
    .bind(id)
    .first<{
      poster_url: string | null;
      size_guide_image_url: string | null;
      archived: number;
  }>();
  if (!current) return { error: "L'activitat no existeix." };

  const variants = parseVariants(String(formData.get("variants_json") ?? "[]"));
  const fields = parseFields(String(formData.get("fields_json") ?? "[]"));
  const catalog = await prepareVariantsAndFields(db, id, variants, fields);
  if ("error" in catalog) return { error: catalog.error };

  // Only reach for Stripe when the edit could invalidate a session in flight.
  // Otherwise an admin fixing a description would throw everyone mid-payment
  // out of checkout, and a Stripe outage would block edits that cannot hurt.
  const checkoutCancellation = catalog.affectsOpenCheckouts
    ? await preparePendingCheckoutCancellation(db, id)
    : { statements: [] as D1PreparedStatement[] };
  if ("error" in checkoutCancellation) return { error: checkoutCancellation.error };

  const posterUrl = posterFiles[0]
    ? await saveMedia("activities", posterFiles[0])
    : current.poster_url;
  let sizeGuideImageUrl = current.size_guide_image_url;
  if (formData.get("remove_size_guide_image")) sizeGuideImageUrl = null;
  if (type === "merch" && guideFiles[0]) {
    sizeGuideImageUrl = await saveMedia("size-guides", guideFiles[0]);
  }

  const activityStatement = db
    .prepare(
      `UPDATE activity SET department_id=?, title_ca=?, title_es=?, title_en=?,
              description_ca=?, description_es=?, description_en=?, poster_url=?,
              starts_at=?, location=?, edition=?, max_per_order=?, published=?,
              size_guide_json=?, size_guide_image_url=?,
              catalog_revision=catalog_revision+1 WHERE id=?`,
    )
    .bind(
      departmentId,
      titleCa,
      str(formData.get("title_es")),
      str(formData.get("title_en")),
      str(formData.get("description_ca")),
      str(formData.get("description_es")),
      str(formData.get("description_en")),
      posterUrl,
      toDatetime(str(formData.get("starts_at")) ?? ""),
      str(formData.get("location")),
      str(formData.get("edition")),
      maxPerOrder(formData.get("max_per_order")),
      current.archived ? 0 : formData.get("published") ? 1 : 0,
      type === "merch" ? sizeGuide.value : null,
      type === "merch" ? sizeGuideImageUrl : null,
      id,
    );

  const retainedImages = parseImages(String(formData.get("gallery_json") ?? "[]"));
  const { results: storedImages } = await db
    .prepare(`SELECT id, image_url FROM activity_image WHERE activity_id = ?`)
    .bind(id)
    .all<{ id: string; image_url: string }>();
  const storedById = new Map(storedImages.map((image) => [image.id, image]));
  const validRetained = retainedImages.filter((image) => storedById.has(image.id));
  const retainedIds = new Set(validRetained.map((image) => image.id));
  const imageStatements = storedImages
    .filter((image) => !retainedIds.has(image.id))
    .map((image) => db.prepare(`DELETE FROM activity_image WHERE id = ?`).bind(image.id));
  validRetained.forEach((image, position) => {
    imageStatements.push(
      db
        .prepare(`UPDATE activity_image SET alt_ca = ?, position = ? WHERE id = ?`)
        .bind(str(image.alt_ca), position, image.id),
    );
  });
  const uploadedGallery = await Promise.all(
    galleryFiles.map((file) => saveMedia("activity-galleries", file)),
  );
  uploadedGallery.forEach((imageUrl, index) => {
    imageStatements.push(
      db
        .prepare(
          `INSERT INTO activity_image (id, activity_id, image_url, alt_ca, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(newId("img"), id, imageUrl, titleCa, validRetained.length + index),
    );
  });
  // One transaction prevents an error in a child row from leaving the main
  // activity, its gallery and its catalogue at different versions.
  await db.batch([
    ...checkoutCancellation.statements,
    activityStatement,
    ...imageStatements,
    ...catalog.statements,
  ]);

  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${id}`);
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/d/[slug]", "page");
  revalidatePath("/[locale]/a/[slug]", "page");
  return null;
}

export async function duplicateActivity(id: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const activity = await db.prepare(`SELECT * FROM activity WHERE id=?`).bind(id).first<{
    department_id: string;
    type: string;
    title_ca: string;
    title_es: string | null;
    title_en: string | null;
    description_ca: string | null;
    description_es: string | null;
    description_en: string | null;
    poster_url: string | null;
    location: string | null;
    max_per_order: number | null;
    size_guide_json: string | null;
    size_guide_image_url: string | null;
  }>();
  if (!activity) return;

  const baseSlug = slugify(`${activity.title_ca} copia`);
  let slug = baseSlug;
  for (let i = 2; await db.prepare(`SELECT 1 FROM activity WHERE slug=?`).bind(slug).first(); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const newActivityId = newId("act");
  const activityStatement = db
    .prepare(
      `INSERT INTO activity
        (id, slug, department_id, type, title_ca, title_es, title_en,
         description_ca, description_es, description_en, poster_url, location,
         max_per_order, published, archived, size_guide_json, size_guide_image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    )
    .bind(
      newActivityId,
      slug,
      activity.department_id,
      activity.type,
      `${activity.title_ca} (còpia)`,
      activity.title_es,
      activity.title_en,
      activity.description_ca,
      activity.description_es,
      activity.description_en,
      activity.poster_url,
      activity.location,
      activity.max_per_order,
      activity.size_guide_json,
      activity.size_guide_image_url,
    );

  const { results: variants } = await db
    .prepare(`SELECT name_ca, name_es, name_en, price_cents, position FROM variant WHERE activity_id=? AND active=1`)
    .bind(id)
    .all<{ name_ca: string; name_es: string | null; name_en: string | null; price_cents: number; position: number }>();
  const { results: fields } = await db
    .prepare(
      `SELECT label_ca, label_es, label_en, type, options_json, required, position FROM field WHERE activity_id=?`,
    )
    .bind(id)
    .all<{
      label_ca: string;
      label_es: string | null;
      label_en: string | null;
      type: string;
      options_json: string | null;
      required: number;
      position: number;
    }>();
  const { results: images } = await db
    .prepare(
      `SELECT image_url, alt_ca, position FROM activity_image
       WHERE activity_id = ? ORDER BY position`,
    )
    .bind(id)
    .all<{ image_url: string; alt_ca: string | null; position: number }>();

  const statements = [
    ...variants.map((v) =>
      db
        .prepare(
          `INSERT INTO variant (id, activity_id, name_ca, name_es, name_en, price_cents, stock, position)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(newId("var"), newActivityId, v.name_ca, v.name_es, v.name_en, v.price_cents, v.position),
    ),
    ...fields.map((f) =>
      db
        .prepare(
          `INSERT INTO field (id, activity_id, position, label_ca, label_es, label_en, type, options_json, required)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("fld"),
          newActivityId,
          f.position,
          f.label_ca,
          f.label_es,
          f.label_en,
          f.type,
          f.options_json,
          f.required,
        ),
    ),
    ...images.map((image) =>
      db
        .prepare(
          `INSERT INTO activity_image (id, activity_id, image_url, alt_ca, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("img"),
          newActivityId,
          image.image_url,
          image.alt_ca,
          image.position,
        ),
    ),
  ];
  await db.batch([activityStatement, ...statements]);

  revalidatePath("/admin/activities");
  redirect(`/admin/activities/${newActivityId}`);
}

export async function setActivityArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const checkoutCancellation = archived
    ? await preparePendingCheckoutCancellation(db, id)
    : { statements: [] as D1PreparedStatement[] };
  if ("error" in checkoutCancellation) throw new Error(checkoutCancellation.error);

  await db.batch([
    ...checkoutCancellation.statements,
    db
      .prepare(
        `UPDATE activity
            SET archived = ?, published = CASE WHEN ? = 1 THEN 0 ELSE published END,
                catalog_revision = catalog_revision + 1
          WHERE id = ?`,
      )
      .bind(archived ? 1 : 0, archived ? 1 : 0, id),
  ]);

  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${id}`);
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/d/[slug]", "page");
  revalidatePath("/[locale]/a/[slug]", "page");
}

export async function deleteActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return { error: "Falta l'identificador." };

  const db = await getDb();
  const orderCount = await db
    .prepare(`SELECT COUNT(*) AS n FROM "order" WHERE activity_id = ?`)
    .bind(id)
    .first<{ n: number }>();
  if ((orderCount?.n ?? 0) > 0) {
    return {
      error: "No es pot eliminar: ja té comandes. Fes servir l'interruptor Publicar per amagar-la.",
    };
  }

  await db.batch([
    db.prepare(`DELETE FROM field WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM variant WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM activity_image WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM activity WHERE id = ?`).bind(id),
  ]);

  revalidatePath("/admin/activities");
  redirect("/admin/activities");
}
