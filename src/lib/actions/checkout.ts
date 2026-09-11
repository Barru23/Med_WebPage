"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { newId, newTicketCode } from "@/lib/ids";
import { AVAIL_EXPR, ON_SALE_EXPR } from "@/lib/availability";
import { utcNow } from "@/lib/time";
import { aggregateByVariant, totalUnits } from "@/lib/orders";
import { serviceFeeCents } from "@/lib/fees";
import { syncOrderToRelay } from "@/lib/relay";
import { hasRequiredLegalIdentity } from "@/lib/legalConfig";
import type { Locale } from "@/lib/locales";

const STRIPE_SESSION_MS = 30 * 60 * 1000;
// Stripe may confirm a payment after the browser session expires. Keep the
// local hold a little longer so webhook latency cannot sell the same seat.
const HOLD_MS = STRIPE_SESSION_MS + 15 * 60 * 1000;
const MAX_CHECKOUT_UNITS = 100;
const MAX_CHECKOUT_PAYLOAD = 100_000;
const MAX_LEN = { name: 120, email: 200, phone: 40, answer: 500 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TERMS_VERSION = "2026-09-10";
const FEE_LABEL: Record<Locale, string> = {
  ca: "Despeses de gestió",
  es: "Gastos de gestión",
  en: "Booking fee",
};

const CHECKOUT_COPY = {
  ca: {
    paused: "Les vendes estan temporalment pausades.",
    identity: "El nom i l'email són obligatoris.",
    email: "L'email no és vàlid.",
    selection: "Selecciona almenys una modalitat.",
    nameLong: "El nom és massa llarg.",
    emailLong: "L'email és massa llarg.",
    phone: "El telèfon no és vàlid.",
    terms: "Has d'acceptar les condicions de compra i la política de privacitat.",
    unavailable: "Aquesta activitat no està disponible.",
    max: "Màxim {n} unitats per comanda.",
    changed: "L'activitat acaba de canviar. Revisa les dades i torna-ho a provar.",
    answer: "Revisa la resposta a «{field}».",
    sensitive: "Has d'acceptar explícitament el tractament de les dades sensibles.",
    variant: "Modalitat no vàlida.",
    soldOut: "No queden prou places de «{variant}».",
    stock: "No queden prou unitats disponibles. Torna-ho a provar.",
    stripe: "No s'ha pogut connectar amb Stripe. Torna-ho a provar.",
  },
  es: {
    paused: "Las ventas están temporalmente pausadas.",
    identity: "El nombre y el email son obligatorios.",
    email: "El email no es válido.",
    selection: "Selecciona al menos una modalidad.",
    nameLong: "El nombre es demasiado largo.",
    emailLong: "El email es demasiado largo.",
    phone: "El teléfono no es válido.",
    terms: "Debes aceptar las condiciones de compra y la política de privacidad.",
    unavailable: "Esta actividad no está disponible.",
    max: "Máximo {n} unidades por pedido.",
    changed: "La actividad acaba de cambiar. Revisa los datos e inténtalo de nuevo.",
    answer: "Revisa la respuesta a «{field}».",
    sensitive: "Debes aceptar expresamente el tratamiento de los datos sensibles.",
    variant: "Modalidad no válida.",
    soldOut: "No quedan suficientes plazas de «{variant}».",
    stock: "No quedan suficientes unidades. Inténtalo de nuevo.",
    stripe: "No se ha podido conectar con Stripe. Inténtalo de nuevo.",
  },
  en: {
    paused: "Sales are temporarily paused.",
    identity: "Name and email are required.",
    email: "The email address is not valid.",
    selection: "Select at least one option.",
    nameLong: "The name is too long.",
    emailLong: "The email address is too long.",
    phone: "The phone number is not valid.",
    terms: "You must accept the terms of sale and privacy policy.",
    unavailable: "This activity is not available.",
    max: "Maximum {n} units per order.",
    changed: "The activity has just changed. Review it and try again.",
    answer: "Review the answer to “{field}”.",
    sensitive: "You must explicitly consent to the processing of sensitive data.",
    variant: "Invalid option.",
    soldOut: "There are not enough places left for “{variant}”.",
    stock: "There are not enough units left. Try again.",
    stripe: "Stripe could not be reached. Try again.",
  },
} as const;

function checkoutMessage(
  locale: Locale,
  key: keyof typeof CHECKOUT_COPY.ca,
  replacements: Record<string, string | number> = {},
): string {
  let message: string = CHECKOUT_COPY[locale][key];
  for (const [name, value] of Object.entries(replacements)) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}

export type CheckoutState = { error?: string } | null;

interface CheckoutLine {
  variantId: string;
  quantity: number;
  answers: Record<string, string>;
}

interface CheckoutField {
  id: string;
  position: number;
  label_ca: string;
  label_es: string | null;
  label_en: string | null;
  type: "text" | "number" | "select" | "checkbox";
  options_json: string | null;
  required: number;
  data_classification: "standard" | "identity" | "health";
}

function str(value: FormDataEntryValue | null): string | null {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}

function parseLines(raw: string): CheckoutLine[] | null {
  if (raw.length > MAX_CHECKOUT_PAYLOAD) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_CHECKOUT_UNITS) return null;
    const lines: CheckoutLine[] = [];
    let units = 0;
    for (const value of parsed) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.variantId !== "string" ||
        candidate.variantId.length > 80 ||
        !Number.isInteger(candidate.quantity) ||
        (candidate.quantity as number) <= 0 ||
        (candidate.quantity as number) > MAX_CHECKOUT_UNITS ||
        !candidate.answers ||
        typeof candidate.answers !== "object" ||
        Array.isArray(candidate.answers)
      ) {
        return null;
      }
      units += candidate.quantity as number;
      if (units > MAX_CHECKOUT_UNITS) return null;
      const answers: Record<string, string> = {};
      for (const [key, answer] of Object.entries(candidate.answers as Record<string, unknown>)) {
        if (typeof answer !== "string" || key.length > 80) return null;
        answers[key] = answer;
      }
      lines.push({
        variantId: candidate.variantId,
        quantity: candidate.quantity as number,
        answers,
      });
    }
    return lines;
  } catch {
    return null;
  }
}

function fieldLabel(field: CheckoutField, locale: Locale): string {
  return field[`label_${locale}`] || field.label_ca;
}

function allowedOptions(field: CheckoutField): Set<string> {
  const result = new Set<string>();
  if (!field.options_json) return result;
  try {
    const parsed: unknown = JSON.parse(field.options_json);
    if (!Array.isArray(parsed)) return result;
    for (const option of parsed) {
      if (typeof option === "string") result.add(option);
      else if (option && typeof option === "object") {
        for (const value of Object.values(option as Record<string, unknown>)) {
          if (typeof value === "string" && value.trim()) result.add(value);
        }
      }
    }
  } catch {
    // An invalid admin value makes the field reject checkout instead of
    // accepting an arbitrary value supplied by the browser.
  }
  return result;
}

function validAnswer(field: CheckoutField, value: string): boolean {
  if (value.length > MAX_LEN.answer) return false;
  if (!value.trim()) return field.required !== 1;
  if (field.type === "number") {
    return /^-?\d+(?:[.,]\d+)?$/.test(value.trim()) &&
      Number.isFinite(Number(value.trim().replace(",", ".")));
  }
  const options = allowedOptions(field);
  if (field.type === "select") return options.has(value);
  if (field.type === "checkbox" && options.size > 0) {
    const selected = value.split(", ").filter(Boolean);
    return selected.length > 0 && new Set(selected).size === selected.length &&
      selected.every((option) => options.has(option));
  }
  if (field.type === "checkbox") {
    return ["Sí", "Si", "Yes", "true", "1"].includes(value);
  }
  return true;
}

async function uniqueTicketCode(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newTicketCode();
    if (!(await db.prepare(`SELECT 1 FROM order_item WHERE ticket_code = ?`).bind(code).first())) {
      return code;
    }
  }
  throw new Error("Could not generate a unique ticket code");
}

async function runtimeConfig(): Promise<{
  checkoutEnabled: boolean;
  termsVersion: string;
  origin: string;
}> {
  const { env } = await getCloudflareContext({ async: true });
  const forwarded = await headers();
  const fallback = `${forwarded.get("x-forwarded-proto") ?? "https"}://${
    forwarded.get("host") ?? "localhost:3000"
  }`;
  const configured = env.PUBLIC_BASE_URL?.trim() || fallback;
  let origin: string;
  try {
    origin = new URL(configured).origin;
  } catch {
    return {
      checkoutEnabled: false,
      termsVersion: env.TERMS_VERSION?.trim() || DEFAULT_TERMS_VERSION,
      origin: "https://xivarri.invalid",
    };
  }
  const legalReady = hasRequiredLegalIdentity(
    env.LEGAL_CONTROLLER_NAME,
    env.LEGAL_CONTACT_EMAIL,
  );
  const local = new URL(origin).hostname === "localhost";
  return {
    checkoutEnabled: env.CHECKOUT_ENABLED === "true" && (local || legalReady),
    termsVersion: env.TERMS_VERSION?.trim() || DEFAULT_TERMS_VERSION,
    origin,
  };
}

export async function submitOrder(
  activitySlug: string,
  locale: Locale,
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const config = await runtimeConfig();
  if (!config.checkoutEnabled) {
    return { error: checkoutMessage(locale, "paused") };
  }

  const buyerName = str(formData.get("buyer_name"));
  const buyerEmail = str(formData.get("buyer_email"));
  const buyerPhone = str(formData.get("buyer_phone"));
  const parsedLines = parseLines(String(formData.get("lines_json") ?? "[]"));
  if (!buyerName || !buyerEmail) return { error: checkoutMessage(locale, "identity") };
  if (!EMAIL_RE.test(buyerEmail)) return { error: checkoutMessage(locale, "email") };
  if (!parsedLines?.length) return { error: checkoutMessage(locale, "selection") };
  if (buyerName.length > MAX_LEN.name) {
    return { error: checkoutMessage(locale, "nameLong") };
  }
  if (buyerEmail.length > MAX_LEN.email) return { error: checkoutMessage(locale, "emailLong") };
  if (buyerPhone && buyerPhone.length > MAX_LEN.phone) {
    return { error: checkoutMessage(locale, "phone") };
  }
  if (!formData.get("terms_accepted")) {
    return { error: checkoutMessage(locale, "terms") };
  }

  const db = await getDb();
  const activity = await db
    .prepare(
      `SELECT a.id, a.type, ae.id AS edition_id, ae.label AS edition,
              ae.max_per_order, ae.catalog_revision
         FROM activity a
         JOIN activity_edition ae ON ae.id = a.current_edition_id
        WHERE a.slug = ? AND a.archived = 0 AND ae.published = 1
          AND ae.ends_at IS NOT NULL`,
    )
    .bind(activitySlug)
    .first<{
      id: string;
      type: "event" | "trip" | "merch";
      edition_id: string;
      edition: string;
      max_per_order: number | null;
      catalog_revision: number;
    }>();
  if (!activity) return { error: checkoutMessage(locale, "unavailable") };

  if (activity.max_per_order && totalUnits(parsedLines) > activity.max_per_order) {
    return { error: checkoutMessage(locale, "max", { n: activity.max_per_order }) };
  }

  const { results: fields } = await db
    .prepare(
      `SELECT id, position, label_ca, label_es, label_en, type, options_json,
              required, data_classification
         FROM field WHERE activity_id = ? ORDER BY position`,
    )
    .bind(activity.id)
    .all<CheckoutField>();
  const fieldById = new Map(fields.map((field) => [field.id, field]));

  // Every activity seat receives an independent code. Merchandise remains one
  // line per variant/quantity because collection happens for the whole line.
  const lines = activity.type === "merch"
    ? parsedLines
    : parsedLines.flatMap((line) =>
        Array.from({ length: line.quantity }, () => ({ ...line, quantity: 1 })),
      );

  let sensitiveAnswerPresent = false;
  for (const line of lines) {
    for (const key of Object.keys(line.answers)) {
      if (!fieldById.has(key)) return { error: checkoutMessage(locale, "changed") };
    }
    for (const field of fields) {
      const value = line.answers[field.id] ?? "";
      if (!validAnswer(field, value)) {
        return { error: checkoutMessage(locale, "answer", { field: fieldLabel(field, locale) }) };
      }
      if (value.trim() && field.data_classification !== "standard") {
        sensitiveAnswerPresent = true;
      }
    }
  }
  if (sensitiveAnswerPresent && !formData.get("sensitive_consent")) {
    return { error: checkoutMessage(locale, "sensitive") };
  }

  // Release only abandoned sessions that Stripe confirms can no longer be
  // paid, and only for this edition.
  const { results: abandoned } = await db
    .prepare(
      `SELECT id, stripe_session_id FROM "order"
        WHERE buyer_email = ? AND activity_edition_id = ? AND status = 'pending'
          AND payment_method = 'stripe' AND stripe_session_id IS NOT NULL`,
    )
    .bind(buyerEmail, activity.edition_id)
    .all<{ id: string; stripe_session_id: string }>();
  for (const old of abandoned) {
    try {
      const stripe = await getStripe();
      await stripe.checkout.sessions.expire(old.stripe_session_id);
      await db.batch([
        db
          .prepare(
            `UPDATE stock_reservation SET expires_at = datetime('now')
              WHERE order_id = ? AND consumed_at IS NULL`,
          )
          .bind(old.id),
        db
          .prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
          .bind(old.id),
      ]);
    } catch (error) {
      console.error("[checkout] Could not release an abandoned hold", {
        orderId: old.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const wanted = aggregateByVariant(lines);
  const variants = new Map<
    string,
    {
      id: string;
      name_ca: string;
      name_es: string | null;
      name_en: string | null;
      price_cents: number;
    }
  >();
  for (const [variantId, quantity] of wanted) {
    const variant = await db
      .prepare(
        `SELECT v.id, v.name_ca, v.name_es, v.name_en, v.price_cents,
                ${AVAIL_EXPR} AS avail
           FROM variant v
          WHERE v.id = ? AND v.activity_id = ? AND v.edition_id = ?
            AND ${ON_SALE_EXPR}`,
      )
      .bind(variantId, activity.id, activity.edition_id)
      .first<{
        id: string;
        name_ca: string;
        name_es: string | null;
        name_en: string | null;
        price_cents: number;
        avail: number;
      }>();
    if (!variant) return { error: checkoutMessage(locale, "variant") };
    if (quantity > variant.avail) {
      const variantName = variant[`name_${locale}`] || variant.name_ca;
      return { error: checkoutMessage(locale, "soldOut", { variant: variantName }) };
    }
    variants.set(variant.id, variant);
  }

  const resolved: Array<{
    variantId: string;
    variantName: string;
    quantity: number;
    answers: Record<string, string>;
    priceCents: number;
  }> = [];
  let subtotal = 0;
  for (const line of lines) {
    const variant = variants.get(line.variantId);
    if (!variant) return { error: checkoutMessage(locale, "variant") };
    const variantName = variant[`name_${locale}`] || variant.name_ca;
    subtotal += variant.price_cents * line.quantity;
    resolved.push({
      variantId: variant.id,
      variantName,
      quantity: line.quantity,
      answers: Object.fromEntries(
        Object.entries(line.answers).filter(([, value]) => value.trim() !== ""),
      ),
      priceCents: variant.price_cents,
    });
  }

  const feeCents = serviceFeeCents(subtotal);
  const totalCents = subtotal + feeCents;
  const paidNow = totalCents === 0;
  const orderId = newId("ord");
  const itemIds = resolved.map(() => newId("oi"));
  const codes: string[] = [];
  for (let index = 0; index < resolved.length; index++) {
    let code: string;
    do code = await uniqueTicketCode(db); while (codes.includes(code));
    codes.push(code);
  }
  const holdExpiresAt = utcNow(HOLD_MS);
  const termsAcceptedAt = utcNow();
  const sensitiveConsentAt = sensitiveAnswerPresent ? termsAcceptedAt : null;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO "order" (
           id, activity_id, activity_edition_id, edition,
           buyer_name, buyer_email, buyer_phone,
           total_cents, fee_cents, currency, status, payment_method,
           locale, terms_accepted_at, terms_version, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', 'pending', ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        orderId,
        activity.id,
        activity.edition_id,
        activity.edition,
        buyerName,
        buyerEmail,
        buyerPhone,
        totalCents,
        feeCents,
        paidNow ? "manual" : "stripe",
        locale,
        termsAcceptedAt,
        config.termsVersion,
      ),
  ];

  resolved.forEach((line, index) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO order_item (
             id, order_id, variant_id, quantity, field_answers_json,
             ticket_code, variant_name_snapshot, unit_price_cents
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          itemIds[index],
          orderId,
          line.variantId,
          line.quantity,
          null,
          codes[index],
          line.variantName,
          line.priceCents,
        ),
    );
    for (const field of fields) {
      const value = line.answers[field.id];
      if (!value) continue;
      statements.push(
        db
          .prepare(
            `INSERT INTO order_item_answer (
               id, order_item_id, field_id_snapshot,
               label_ca_snapshot, label_es_snapshot, label_en_snapshot,
               field_type_snapshot, value_text, position,
               consented_at, consent_version, data_classification_snapshot
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId("ans"),
            itemIds[index],
            field.id,
            field.label_ca,
            field.label_es,
            field.label_en,
            field.type,
            value,
            field.position,
            field.data_classification === "standard" ? null : sensitiveConsentAt,
            field.data_classification === "standard" ? null : config.termsVersion,
            field.data_classification,
          ),
      );
    }
  });

  for (const [variantId, quantity] of wanted) {
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_reservation (
             id, order_id, variant_id, quantity, expires_at
           )
           SELECT ?, ?, v.id, ?, ?
             FROM variant v
            WHERE v.id = ? AND v.edition_id = ? AND ${ON_SALE_EXPR}
              AND ${AVAIL_EXPR} >= ?`,
        )
        .bind(
          newId("res"),
          orderId,
          quantity,
          holdExpiresAt,
          variantId,
          activity.edition_id,
          quantity,
        ),
    );
  }
  await db.batch(statements);

  const reservationCount = await db
    .prepare(`SELECT COUNT(*) AS count FROM stock_reservation WHERE order_id = ?`)
    .bind(orderId)
    .first<{ count: number }>();
  if ((reservationCount?.count ?? 0) !== wanted.size) {
    await db.batch([
      db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ?`).bind(orderId),
      db
        .prepare(
          `UPDATE stock_reservation SET expires_at = datetime('now')
            WHERE order_id = ? AND consumed_at IS NULL`,
        )
        .bind(orderId),
    ]);
    return { error: checkoutMessage(locale, "stock") };
  }

  let destination = codes.length === 1
    ? `/${locale}/t/${codes[0]}`
    : `/${locale}/o/${orderId}`;

  if (paidNow) {
    await db.batch([
      db
        .prepare(
          `UPDATE "order" SET status = 'paid', paid_at = datetime('now')
            WHERE id = ? AND status = 'pending'
              AND EXISTS (
                SELECT 1 FROM activity a
                JOIN activity_edition ae ON ae.id = a.current_edition_id
                WHERE a.id = ? AND ae.id = ? AND ae.catalog_revision = ?
                  AND ae.published = 1 AND a.archived = 0
              )`,
        )
        .bind(orderId, activity.id, activity.edition_id, activity.catalog_revision),
      db
        .prepare(
          `UPDATE stock_reservation SET consumed_at = datetime('now')
            WHERE order_id = ? AND consumed_at IS NULL
              AND EXISTS (
                SELECT 1 FROM "order" o WHERE o.id = ? AND o.status = 'paid'
              )`,
        )
        .bind(orderId, orderId),
    ]);
    const paidOrder = await db
      .prepare(`SELECT 1 FROM "order" WHERE id = ? AND status = 'paid'`)
      .bind(orderId)
      .first();
    if (!paidOrder) {
      await db.batch([
        db.prepare(`UPDATE "order" SET status = 'cancelled' WHERE id = ?`).bind(orderId),
        db
          .prepare(
            `UPDATE stock_reservation SET expires_at = datetime('now')
              WHERE order_id = ? AND consumed_at IS NULL`,
          )
          .bind(orderId),
      ]);
      return { error: checkoutMessage(locale, "changed") };
    }
    await syncOrderToRelay(orderId, config.origin);
  } else {
    try {
      const stripe = await getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card", "bizum"],
        customer_email: buyerEmail,
        line_items: [
          ...resolved.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: "eur" as const,
              unit_amount: line.priceCents,
              product_data: { name: line.variantName },
            },
          })),
          ...(feeCents > 0
            ? [{
                quantity: 1,
                price_data: {
                  currency: "eur" as const,
                  unit_amount: feeCents,
                  product_data: { name: FEE_LABEL[locale] },
                },
              }]
            : []),
        ],
        success_url: `${config.origin}${destination}`,
        cancel_url: `${config.origin}/${locale}/a/${activitySlug}`,
        metadata: { orderId, catalogRevision: String(activity.catalog_revision) },
        expires_at: Math.floor((Date.now() + STRIPE_SESSION_MS) / 1000),
      });
      if (!session.url) throw new Error("Missing Stripe URL");
      await db
        .prepare(
          `UPDATE "order" SET stripe_session_id = ?
            WHERE id = ? AND status = 'pending'`,
        )
        .bind(session.id, orderId)
        .run();

      const catalogStillCurrent = await db
        .prepare(
          `SELECT 1 FROM activity a
             JOIN activity_edition ae ON ae.id = a.current_edition_id
            WHERE a.id = ? AND ae.id = ? AND ae.catalog_revision = ?
              AND ae.published = 1 AND a.archived = 0`,
        )
        .bind(activity.id, activity.edition_id, activity.catalog_revision)
        .first();
      if (!catalogStillCurrent) {
        await stripe.checkout.sessions.expire(session.id);
        await db.batch([
          db
            .prepare(
              `UPDATE "order" SET status = 'cancelled'
                WHERE id = ? AND status = 'pending'`,
            )
            .bind(orderId),
          db
            .prepare(
              `UPDATE stock_reservation SET expires_at = datetime('now')
                WHERE order_id = ? AND consumed_at IS NULL`,
            )
            .bind(orderId),
        ]);
        return { error: checkoutMessage(locale, "changed") };
      }
      destination = session.url;
    } catch (error) {
      console.error("[checkout] Stripe session failed", {
        orderId,
        message: error instanceof Error ? error.message : String(error),
      });
      await db.batch([
        db
          .prepare(
            `UPDATE "order" SET status = 'cancelled'
              WHERE id = ? AND status = 'pending'`,
          )
          .bind(orderId),
        db
          .prepare(
            `UPDATE stock_reservation SET expires_at = datetime('now')
              WHERE order_id = ? AND consumed_at IS NULL`,
          )
          .bind(orderId),
      ]);
      return { error: checkoutMessage(locale, "stripe") };
    }
  }

  revalidatePath("/[locale]/a/[slug]", "page");
  revalidatePath("/[locale]/d/[slug]", "page");
  revalidatePath("/admin/activities");
  redirect(destination);
}
