"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { deleteMedia, saveMedia, validateImageFile } from "@/lib/storage";
import { getStripe } from "@/lib/stripe";
import { wallTimeToUtc } from "@/lib/time";
import { eurosToCents } from "@/lib/admin/money";
import { HELD_BY_STRIPE, SOLD_FROM_ORDERS } from "@/lib/availability";
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

async function deleteMediaIfUnreferenced(
  db: D1Database,
  url: string | null | undefined,
): Promise<void> {
  if (!url) return;
  const reference = await db
    .prepare(
      `SELECT 1 FROM activity
        WHERE poster_url = ? OR size_guide_image_url = ?
       UNION ALL SELECT 1 FROM activity_image WHERE image_url = ?
       UNION ALL SELECT 1 FROM department WHERE photo_url = ?
       LIMIT 1`,
    )
    .bind(url, url, url, url)
    .first();
  if (!reference) await deleteMedia(url);
}

function maxPerOrder(v: FormDataEntryValue | null): number | null {
  const raw = str(v);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 100 ? n : null;
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

async function validateImages(files: File[]): Promise<string | null> {
  if (files.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) {
    return "El conjunt d'imatges ha de pesar 10 MB o menys.";
  }
  try {
    for (const file of files) await validateImageFile(file);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "La imatge no és vàlida.";
  }
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
  editionId: string,
  variants: VariantDraft[],
  fields: FieldDraft[],
): Promise<CatalogPlan> {
  const validVariants = variants.filter((v) => v.name_ca.trim() !== "");
  if (validVariants.length === 0) {
    return { error: "Cal almenys una modalitat (variant)." };
  }
  const fieldTypes = new Set(["text", "number", "select", "checkbox"]);
  const classifications = new Set(["standard", "identity", "health"]);
  if (
    fields.some(
      (field) =>
        !field.label_ca?.trim() || !fieldTypes.has(field.type) ||
        !classifications.has(field.data_classification),
    )
  ) {
    return { error: "Revisa el nom, tipus i classificació de les preguntes." };
  }

  const pricedVariants: Array<{ draft: VariantDraft; priceCents: number; stock: number }> = [];
  for (const variant of validVariants) {
    const priceCents = eurosToCents(variant.price_euros);
    if (priceCents === null) {
      return {
        error: `El preu de «${variant.name_ca}» no és vàlid. Escriu, per exemple, 12,50.`,
      };
    }
    if (!/^\d+$/.test(variant.stock.trim())) {
      return { error: `L'estoc de «${variant.name_ca}» ha de ser un enter positiu o zero.` };
    }
    const stock = Number(variant.stock);
    if (!Number.isSafeInteger(stock)) {
      return { error: `L'estoc de «${variant.name_ca}» és massa gran.` };
    }
    const saleStart = toDatetime(variant.sale_start);
    const saleEnd = toDatetime(variant.sale_end);
    if (saleStart && saleEnd && saleStart > saleEnd) {
      return { error: `La venda de «${variant.name_ca}» no pot acabar abans de començar.` };
    }
    pricedVariants.push({ draft: variant, priceCents, stock });
  }

  const [{ results: existingVariants }, { results: existingFields }] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.price_cents, v.stock, v.sale_start, v.sale_end,
                ${SOLD_FROM_ORDERS} AS sold_real, ${HELD_BY_STRIPE} AS held
           FROM variant v
          WHERE v.activity_id = ? AND v.edition_id = ? AND v.active = 1`,
      )
      .bind(activityId, editionId)
      .all<{
        id: string;
        price_cents: number;
        stock: number;
        sale_start: string | null;
        sale_end: string | null;
        sold_real: number;
        held: number;
      }>(),
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

  for (const { draft, stock } of pricedVariants) {
    const existing = draft.id
      ? existingVariants.find((variant) => variant.id === draft.id)
      : null;
    if (existing && stock < existing.sold_real + existing.held) {
      return {
        error: `L'estoc de «${draft.name_ca}» no pot baixar de ${existing.sold_real + existing.held}: hi ha vendes o reserves actives.`,
      };
    }
  }

  pricedVariants.forEach(({ draft: v, priceCents, stock }, position) => {
    if (v.id) {
      statements.push(
        db
          .prepare(
            `UPDATE variant SET name_ca=?, name_es=?, name_en=?, price_cents=?, stock=?,
                    sale_start=?, sale_end=?, position=?, active=1
              WHERE id=? AND activity_id=? AND edition_id=?`,
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
            editionId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO variant (id, activity_id, edition_id, name_ca, name_es, name_en, price_cents, stock, sale_start, sale_end, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId("var"),
            activityId,
            editionId,
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
    const caOptions = (f.options ?? "").split("\n").map((option) => option.trim()).filter(Boolean);
    const esOptions = (f.options_es ?? "").split("\n").map((option) => option.trim());
    const enOptions = (f.options_en ?? "").split("\n").map((option) => option.trim());
    const options =
      (f.type === "select" || f.type === "checkbox") && caOptions.length
        ? JSON.stringify(
            caOptions.map((ca, index) => ({
              ca,
              es: esOptions[index] || ca,
              en: enOptions[index] || ca,
            })),
          )
        : null;
    if (f.id) {
      statements.push(
        db
          .prepare(
            `UPDATE field SET label_ca=?, label_es=?, label_en=?, type=?, options_json=?, required=?, position=?, data_classification=?
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
            f.data_classification,
            f.id,
            activityId,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO field (id, activity_id, position, label_ca, label_es, label_en, type, options_json, required, data_classification)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            f.data_classification,
          ),
      );
    }
  });

  // A session's line items carry the price the buyer agreed to. Only a price
  // that moved, or a modality that went away, can make that snapshot wrong.
  const previousOf = new Map(existingVariants.map((v) => [v.id, v]));
  const affectsOpenCheckouts =
    removed.length > 0 ||
    pricedVariants.some(
      ({ draft, priceCents, stock }) => {
        if (!draft.id) return false;
        const previous = previousOf.get(draft.id);
        return !previous || previous.price_cents !== priceCents || previous.stock !== stock ||
          previous.sale_start !== toDatetime(draft.sale_start) ||
          previous.sale_end !== toDatetime(draft.sale_end);
      },
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
            WHERE order_id = ? AND consumed_at IS NULL
              AND EXISTS (
                SELECT 1 FROM "order" o
                 WHERE o.id = ? AND o.stripe_session_id = ?
                   AND o.status = 'cancelled'
              )`,
        )
        .bind(order.id, order.id, order.stripe_session_id),
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
  const startsAt = toDatetime(str(formData.get("starts_at")) ?? "");
  const endsAt = toDatetime(str(formData.get("ends_at")) ?? "");
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: "La data final no pot ser anterior a la data d'inici." };
  }

  const sizeGuide = normalizedSizeGuide(
    parseSizeGuide(String(formData.get("size_guide_json") ?? "[]")),
  );
  if (sizeGuide.error) return { error: sizeGuide.error };
  const galleryFiles = imageFiles(formData, "gallery");
  const guideFiles = imageFiles(formData, "size_guide_image");
  const posterFiles = imageFiles(formData, "poster");
  const mediaError = await validateImages([
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
  const editionId = newId("ed");
  const editionLabel = str(formData.get("edition")) ?? "Edició inicial";
  const orderLimit = maxPerOrder(formData.get("max_per_order"));
  if (str(formData.get("max_per_order")) && orderLimit === null) {
    return { error: "El màxim per compra ha de ser un enter entre 1 i 100." };
  }
  const variants = parseVariants(String(formData.get("variants_json") ?? "[]"));
  const fields = parseFields(String(formData.get("fields_json") ?? "[]"));
  const wantsPublished = Boolean(formData.get("published"));
  if (wantsPublished && !endsAt) {
    return {
      error: "Cal indicar una data final abans de publicar l'activitat.",
    };
  }
  const catalog = await prepareVariantsAndFields(db, id, editionId, variants, fields);
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
      editionLabel,
      orderLimit,
      wantsPublished ? 1 : 0,
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
  const editionStatement = db
    .prepare(
      `INSERT INTO activity_edition (
         id, activity_id, label, starts_at, ends_at, location, max_per_order, published,
         catalog_revision
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      editionId,
      id,
      editionLabel,
      toDatetime(str(formData.get("starts_at")) ?? ""),
      toDatetime(str(formData.get("ends_at")) ?? ""),
      str(formData.get("location")),
      orderLimit,
      wantsPublished ? 1 : 0,
    );
  const selectEditionStatement = db
    .prepare(`UPDATE activity SET current_edition_id = ? WHERE id = ?`)
    .bind(editionId, id);

  // D1 batches are transactional: either the activity and all its editable
  // children are created, or none of them are.
  await db.batch([
    activityStatement,
    editionStatement,
    selectEditionStatement,
    ...catalog.statements,
    ...galleryStatements,
  ]);

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
  const startsAt = toDatetime(str(formData.get("starts_at")) ?? "");
  const endsAt = toDatetime(str(formData.get("ends_at")) ?? "");
  if (startsAt && endsAt && startsAt > endsAt) {
    return { error: "La data final no pot ser anterior a la data d'inici." };
  }
  const sizeGuide = normalizedSizeGuide(
    parseSizeGuide(String(formData.get("size_guide_json") ?? "[]")),
  );
  if (sizeGuide.error) return { error: sizeGuide.error };
  const galleryFiles = imageFiles(formData, "gallery");
  const guideFiles = imageFiles(formData, "size_guide_image");
  const posterFiles = imageFiles(formData, "poster");
  const mediaError = await validateImages([...galleryFiles, ...guideFiles, ...posterFiles]);
  if (mediaError) return { error: mediaError };

  const db = await getDb();
  const current = await db
    .prepare(
      `SELECT a.poster_url, a.size_guide_image_url, a.archived,
              ae.id AS edition_id, ae.published, ae.max_per_order
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
        WHERE a.id = ?`,
    )
    .bind(id)
    .first<{
      poster_url: string | null;
      size_guide_image_url: string | null;
      archived: number;
      edition_id: string;
      published: number;
      max_per_order: number | null;
  }>();
  if (!current) return { error: "L'activitat no existeix." };

  const variants = parseVariants(String(formData.get("variants_json") ?? "[]"));
  const fields = parseFields(String(formData.get("fields_json") ?? "[]"));
  const orderLimit = maxPerOrder(formData.get("max_per_order"));
  if (str(formData.get("max_per_order")) && orderLimit === null) {
    return { error: "El màxim per compra ha de ser un enter entre 1 i 100." };
  }
  const catalog = await prepareVariantsAndFields(
    db,
    id,
    current.edition_id,
    variants,
    fields,
  );
  if ("error" in catalog) return { error: catalog.error };

  const nextPublished = current.archived ? 0 : formData.get("published") ? 1 : 0;
  if (nextPublished && !endsAt) {
    return {
      error: "Cal indicar una data final abans de publicar l'activitat.",
    };
  }
  const editionAffectsOpenCheckouts =
    current.published !== nextPublished || current.max_per_order !== orderLimit;

  // Only reach for Stripe when the edit could invalidate a session in flight.
  // Otherwise an admin fixing a description would throw everyone mid-payment
  // out of checkout, and a Stripe outage would block edits that cannot hurt.
  const checkoutCancellation = catalog.affectsOpenCheckouts || editionAffectsOpenCheckouts
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
      orderLimit,
      nextPublished,
      type === "merch" ? sizeGuide.value : null,
      type === "merch" ? sizeGuideImageUrl : null,
      id,
    );
  const editionStatement = db
    .prepare(
      `UPDATE activity_edition
          SET label = ?, starts_at = ?, ends_at = ?, location = ?, max_per_order = ?,
              published = ?, catalog_revision = catalog_revision + 1
        WHERE id = ? AND activity_id = ?`,
    )
    .bind(
      str(formData.get("edition")) ?? "Edició inicial",
      toDatetime(str(formData.get("starts_at")) ?? ""),
      toDatetime(str(formData.get("ends_at")) ?? ""),
      str(formData.get("location")),
      orderLimit,
      nextPublished,
      current.edition_id,
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
    editionStatement,
    ...imageStatements,
    ...catalog.statements,
  ]);
  const removedMedia = [
    ...storedImages
      .filter((image) => !retainedIds.has(image.id))
      .map((image) => image.image_url),
    ...(posterFiles[0] && current.poster_url !== posterUrl ? [current.poster_url] : []),
    ...(current.size_guide_image_url !== sizeGuideImageUrl
      ? [current.size_guide_image_url]
      : []),
  ].filter((url): url is string => Boolean(url));
  await Promise.allSettled(
    removedMedia.map((url) => deleteMediaIfUnreferenced(db, url)),
  );

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
  const activity = await db.prepare(
    `SELECT a.*, ae.label AS edition_label, ae.starts_at AS edition_starts_at,
            ae.location AS edition_location, ae.max_per_order AS edition_max_per_order
       FROM activity a
       JOIN activity_edition ae ON ae.id = a.current_edition_id
      WHERE a.id = ?`,
  ).bind(id).first<{
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
    edition_label: string;
    edition_starts_at: string | null;
    edition_location: string | null;
    edition_max_per_order: number | null;
  }>();
  if (!activity) return;

  const baseSlug = slugify(`${activity.title_ca} copia`);
  let slug = baseSlug;
  for (let i = 2; await db.prepare(`SELECT 1 FROM activity WHERE slug=?`).bind(slug).first(); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const newActivityId = newId("act");
  const newEditionId = newId("ed");
  const activityStatement = db
    .prepare(
      `INSERT INTO activity
        (id, slug, department_id, type, title_ca, title_es, title_en,
         description_ca, description_es, description_en, poster_url, starts_at,
         location, edition, max_per_order, published, archived,
         size_guide_json, size_guide_image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
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
      activity.edition_starts_at,
      activity.edition_location,
      activity.edition_label,
      activity.edition_max_per_order,
      activity.size_guide_json,
      activity.size_guide_image_url,
    );

  const { results: variants } = await db
    .prepare(`SELECT name_ca, name_es, name_en, price_cents, position FROM variant WHERE activity_id=? AND edition_id = (SELECT current_edition_id FROM activity WHERE id = ?) AND active=1`)
    .bind(id, id)
    .all<{ name_ca: string; name_es: string | null; name_en: string | null; price_cents: number; position: number }>();
  const { results: fields } = await db
    .prepare(
      `SELECT label_ca, label_es, label_en, type, options_json, required, position,
              data_classification FROM field WHERE activity_id=?`,
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
      data_classification: string;
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
          `INSERT INTO variant (id, activity_id, edition_id, name_ca, name_es, name_en, price_cents, stock, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(newId("var"), newActivityId, newEditionId, v.name_ca, v.name_es, v.name_en, v.price_cents, v.position),
    ),
    ...fields.map((f) =>
      db
        .prepare(
          `INSERT INTO field (id, activity_id, position, label_ca, label_es, label_en, type, options_json, required, data_classification)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          f.data_classification,
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
  const editionStatement = db
    .prepare(
      `INSERT INTO activity_edition (
         id, activity_id, label, starts_at, location, max_per_order, published
       ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      newEditionId,
      newActivityId,
      activity.edition_label,
      activity.edition_starts_at,
      activity.edition_location,
      activity.edition_max_per_order,
    );
  const selectEditionStatement = db
    .prepare(`UPDATE activity SET current_edition_id = ? WHERE id = ?`)
    .bind(newEditionId, newActivityId);
  await db.batch([activityStatement, editionStatement, selectEditionStatement, ...statements]);

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
        `UPDATE activity_edition
            SET published = CASE WHEN ? = 1 THEN 0 ELSE published END,
                catalog_revision = catalog_revision + 1
          WHERE id = (SELECT current_edition_id FROM activity WHERE id = ?)` ,
      )
      .bind(archived ? 1 : 0, id),
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

/** Start a fresh sellable edition while keeping all historical orders intact. */
export async function createActivityEdition(formData: FormData): Promise<void> {
  await requireAdmin();
  const activityId = str(formData.get("activity_id"));
  const label = str(formData.get("edition_label"));
  if (!activityId || !label) throw new Error("Cal indicar el nom de la nova edició.");

  const db = await getDb();
  const activity = await db
    .prepare(
      `SELECT a.id, a.current_edition_id, ae.location, ae.max_per_order
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
        WHERE a.id = ?`,
    )
    .bind(activityId)
    .first<{
      id: string;
      current_edition_id: string;
      location: string | null;
      max_per_order: number | null;
    }>();
  if (!activity) throw new Error("L'activitat no existeix.");
  if (
    await db
      .prepare(`SELECT 1 FROM activity_edition WHERE activity_id = ? AND label = ?`)
      .bind(activityId, label)
      .first()
  ) {
    throw new Error("Ja existeix una edició amb aquest nom.");
  }

  const cancellation = await preparePendingCheckoutCancellation(db, activityId);
  if ("error" in cancellation) throw new Error(cancellation.error);
  const { results: variants } = await db
    .prepare(
      `SELECT name_ca, name_es, name_en, price_cents, stock, position
         FROM variant
        WHERE edition_id = ? AND active = 1 ORDER BY position`,
    )
    .bind(activity.current_edition_id)
    .all<{
      name_ca: string;
      name_es: string | null;
      name_en: string | null;
      price_cents: number;
      stock: number;
      position: number;
    }>();

  const editionId = newId("ed");
  await db.batch([
    ...cancellation.statements,
    db
      .prepare(
        `INSERT INTO activity_edition (
           id, activity_id, label, location, max_per_order, published
         ) VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(editionId, activityId, label, activity.location, activity.max_per_order),
    ...variants.map((variant) =>
      db
        .prepare(
          `INSERT INTO variant (
             id, activity_id, edition_id, name_ca, name_es, name_en,
             price_cents, stock, sold, position, active
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
        )
        .bind(
          newId("var"),
          activityId,
          editionId,
          variant.name_ca,
          variant.name_es,
          variant.name_en,
          variant.price_cents,
          variant.stock,
          variant.position,
        ),
    ),
    db
      .prepare(
        `UPDATE activity
            SET current_edition_id = ?, edition = ?, starts_at = NULL,
                published = 0, catalog_revision = catalog_revision + 1
          WHERE id = ?`,
      )
      .bind(editionId, label, activityId),
  ]);

  revalidatePath("/admin/activities");
  revalidatePath(`/admin/activities/${activityId}`);
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/a/[slug]", "page");
  redirect(`/admin/activities/${activityId}`);
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

  const activityMedia = await db
    .prepare(`SELECT poster_url, size_guide_image_url FROM activity WHERE id = ?`)
    .bind(id)
    .first<{ poster_url: string | null; size_guide_image_url: string | null }>();
  const { results: galleryMedia } = await db
    .prepare(`SELECT image_url FROM activity_image WHERE activity_id = ?`)
    .bind(id)
    .all<{ image_url: string }>();

  await db.batch([
    db.prepare(`DELETE FROM field WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM variant WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM activity_image WHERE activity_id = ?`).bind(id),
    db.prepare(`DELETE FROM activity WHERE id = ?`).bind(id),
  ]);
  await Promise.allSettled([
    deleteMediaIfUnreferenced(db, activityMedia?.poster_url),
    deleteMediaIfUnreferenced(db, activityMedia?.size_guide_image_url),
    ...galleryMedia.map((image) => deleteMediaIfUnreferenced(db, image.image_url)),
  ]);

  revalidatePath("/admin/activities");
  redirect("/admin/activities");
}
