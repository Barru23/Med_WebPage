"use client";

import { useActionState, useId, useState } from "react";
import { submitOrder, type CheckoutState } from "@/lib/actions/checkout";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { serviceFeeCents } from "@/lib/fees";
import SubmitButton from "@/components/admin/SubmitButton";
import { pick, type Locale } from "@/lib/i18n";
import type { Variant, Field } from "@/lib/queries";

interface TicketLine {
  uid: string;
  variantId: string;
  answers: Record<string, string>;
}

function parseOptions(field: Field, locale: Locale): string[] {
  if (!field.options_json) return [];
  try {
    const parsed = JSON.parse(field.options_json) as unknown[];
    return parsed.map((o) =>
      typeof o === "string"
        ? o
        : ((o as Record<string, string>)[locale] ??
          (o as Record<string, string>).ca ??
          (o as Record<string, string>).value ??
          ""),
    );
  } catch {
    return [];
  }
}

export interface CheckoutStrings {
  addOne: string;
  addTicket: string;
  removeOne: string;
  maxPerOrder: string;
  privacyLink: string;
  serviceFee: string;
  sensitiveConsent: string;
  subtotal: string;
  termsAccept: string;
  termsLink: string;
  total: string;
  buy: string;
  buyerName: string;
  buyerPhone: string;
  modalitats: string;
  soldOut: string;
  yourDetails: string;
}

export default function CheckoutForm({
  activitySlug,
  locale,
  variants,
  fields,
  maxPerOrder,
  strings,
}: {
  activitySlug: string;
  locale: Locale;
  variants: Variant[];
  fields: Field[];
  maxPerOrder: number | null;
  strings: CheckoutStrings;
}) {
  const boundAction = submitOrder.bind(null, activitySlug, locale);
  const [state, formAction] = useActionState<CheckoutState, FormData>(boundAction, null);

  const hasFields = fields.length > 0;
  const hasSensitiveFields = fields.some((field) => field.data_classification !== "standard");
  const buyableVariants = variants.filter((v) => v.avail > 0);
  const uidBase = useId();

  // No custom fields: one quantity stepper per variant.
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Custom fields: one line per ticket, each with its own variant + answers.
  const [lines, setLines] = useState<TicketLine[]>(() =>
    buyableVariants[0]
      ? [{ uid: `${uidBase}-0`, variantId: buyableVariants[0].id, answers: {} }]
      : [],
  );

  if (buyableVariants.length === 0) {
    return <p className="font-mono text-sm text-ink/70">{strings.soldOut}</p>;
  }

  const total = hasFields
    ? lines.reduce((sum, l) => {
        const v = variants.find((x) => x.id === l.variantId);
        return sum + (v?.price_cents ?? 0);
      }, 0)
    : Object.entries(quantities).reduce((sum, [id, qty]) => {
        const v = variants.find((x) => x.id === id);
        return sum + (v?.price_cents ?? 0) * qty;
      }, 0);

  const fee = serviceFeeCents(total);
  const charged = total + fee;

  // Safety ceiling mirrored by the server; an activity may choose a lower cap.
  const effectiveMax = Math.min(maxPerOrder ?? 100, 100);
  const unitsSoFar = hasFields
    ? lines.length
    : Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const capReached = unitsSoFar >= effectiveMax;

  const linesPayload = hasFields
    ? lines.map((l) => ({ variantId: l.variantId, quantity: 1, answers: l.answers }))
    : Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([variantId, quantity]) => ({ variantId, quantity, answers: {} }));

  /** Unitats que encara caben d'aquesta modalitat: el que en queda, i el que
   *  permet el màxim per comanda un cop descomptat el que ja hi ha triat. */
  function roomFor(v: Variant): number {
    const current = quantities[v.id] ?? 0;
    const others = unitsSoFar - current;
    const ceiling = Math.min(v.avail, effectiveMax - others);
    return Math.max(0, ceiling - current);
  }

  /** Mou una quantitat. Els botons hi passen un increment; el teclat, el valor
   *  sencer. Els dos camins passen pel mateix sostre, que és tot el sentit de
   *  tenir-ho en un sol lloc.
   *
   *  El sostre es calcula des de `prev` i no des de l'estat d'aquest render: un
   *  botó convida a prémer-lo dues vegades seguides, React ajunta les dues
   *  actualitzacions, i comptar les altres modalitats des del render vell deixa
   *  colar una unitat per sobre del màxim per comanda. */
  function setQuantity(v: Variant, value: number, absolute = false) {
    setQuantities((prev) => {
      const current = prev[v.id] ?? 0;
      const others = Object.entries(prev).reduce(
        (sum, [id, qty]) => (id === v.id ? sum : sum + qty),
        0,
      );
      const ceiling = Math.min(v.avail, effectiveMax - others);
      return { ...prev, [v.id]: Math.max(0, Math.min(ceiling, absolute ? value : current + value)) };
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lines_json" value={JSON.stringify(linesPayload)} readOnly />

      {maxPerOrder !== null && (
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
          {strings.maxPerOrder.replace("{n}", String(maxPerOrder))}
        </p>
      )}

      {!hasFields && (
        <ul className="divide-y divide-sand border-y border-sand">
          {buyableVariants.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-3">
              <span className="flex-1 font-body text-ink">{pick(v, "name", locale)}</span>
              <span aria-hidden className="leader" />
              <span className="font-mono text-sm text-ink">
                {formatPrice(v.price_cents, locale)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuantity(v, -1)}
                  disabled={(quantities[v.id] ?? 0) === 0}
                  className="qty-btn"
                  aria-label={`${strings.removeOne} — ${pick(v, "name", locale)}`}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={v.avail}
                  value={quantities[v.id] ?? 0}
                  onChange={(e) => setQuantity(v, Number(e.target.value) || 0, true)}
                  className="admin-input w-12 text-center"
                  aria-label={pick(v, "name", locale)}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(v, 1)}
                  disabled={roomFor(v) === 0}
                  className="qty-btn"
                  aria-label={`${strings.addOne} — ${pick(v, "name", locale)}`}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasFields && (
        <div className="flex flex-col gap-5">
          {lines.map((line, i) => (
            <div key={line.uid} className="admin-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
                  {strings.modalitats} #{i + 1}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}
                    className="font-mono text-[0.65rem] uppercase tracking-widest text-signal"
                  >
                    {strings.removeOne}
                  </button>
                )}
              </div>

              <select
                className="admin-select mt-2"
                value={line.variantId}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) =>
                      l.uid === line.uid ? { ...l, variantId: e.target.value } : l,
                    ),
                  )
                }
              >
                {buyableVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {pick(v, "name", locale)} — {formatPrice(v.price_cents, locale)}
                  </option>
                ))}
              </select>

              <div className="mt-3 flex flex-col gap-2">
                {fields.map((f) => (
                  <FieldInput
                    key={f.id}
                    field={f}
                    locale={locale}
                    value={line.answers[f.id] ?? ""}
                    onChange={(value) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.uid === line.uid
                            ? { ...l, answers: { ...l.answers, [f.id]: value } }
                            : l,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          {!capReached && (
            <button
              type="button"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { uid: `${uidBase}-${prev.length}`, variantId: buyableVariants[0].id, answers: {} },
                ])
              }
              className="admin-btn self-start text-sm"
            >
              + {strings.addTicket}
            </button>
          )}
        </div>
      )}

      <div>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/70">
          {strings.yourDetails}
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="admin-label">{strings.buyerName} *</span>
            <input className="admin-input" name="buyer_name" required />
          </label>
          <label className="block">
            <span className="admin-label">Email *</span>
            <input className="admin-input" name="buyer_email" type="email" required />
          </label>
          <label className="block">
            <span className="admin-label">{strings.buyerPhone}</span>
            <input className="admin-input" name="buyer_phone" type="tel" />
          </label>
        </div>
      </div>

      {state?.error && <p role="alert" className="font-mono text-sm text-signal">{state.error}</p>}

      {/* El total final es veu ABANS de clicar, no només a la pantalla de
          pagament: quan el comprador hi arriba ja s'ha compromès. */}
      {fee > 0 && (
        <dl className="flex flex-col gap-1 border-t border-sand pt-3 font-mono text-xs text-ink/60">
          <div className="flex justify-between">
            <dt>{strings.subtotal}</dt>
            <dd>{formatPrice(total, locale)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{strings.serviceFee}</dt>
            <dd>{formatPrice(fee, locale)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-ink">
            <dt>{strings.total}</dt>
            <dd>{formatPrice(charged, locale)}</dd>
          </div>
        </dl>
      )}

      <label className="flex items-start gap-2 font-body text-sm text-ink">
        <input
          type="checkbox"
          name="terms_accepted"
          required
          className="mt-0.5 shrink-0"
        />
        <span>
          {strings.termsAccept.split(/(\{terms\}|\{privacy\})/).map((part, i) => {
            if (part === "{terms}") {
              return (
                <Link
                  key={i}
                  href={`/${locale}/legal/condicions`}
                  target="_blank"
                  className="text-signal underline underline-offset-2"
                >
                  {strings.termsLink}
                </Link>
              );
            }
            if (part === "{privacy}") {
              return (
                <Link
                  key={i}
                  href={`/${locale}/legal/privacitat`}
                  target="_blank"
                  className="text-signal underline underline-offset-2"
                >
                  {strings.privacyLink}
                </Link>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      </label>

      {hasSensitiveFields && (
        <label className="flex items-start gap-2 font-body text-sm text-ink">
          <input
            type="checkbox"
            name="sensitive_consent"
            required
            className="mt-0.5 shrink-0"
          />
          <span>{strings.sensitiveConsent}</span>
        </label>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton className="admin-btn admin-btn-primary text-base" pendingText="Enviant…">
          {strings.buy} · {formatPrice(charged, locale)}
        </SubmitButton>
      </div>
    </form>
  );
}

function FieldInput({
  field,
  locale,
  value,
  onChange,
}: {
  field: Field;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = pick(field, "label", locale);
  const options = parseOptions(field, locale);

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="admin-label">
          {label}
          {field.required === 1 && <span className="text-signal"> *</span>}
        </span>
        <select
          className="admin-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required === 1}
        >
          <option value="" disabled>
            —
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox" && options.length > 0) {
    const selected = value ? value.split(", ") : [];
    return (
      <fieldset>
        <legend className="admin-label">
          {label}
          {field.required === 1 && <span className="text-signal"> *</span>}
        </legend>
        <div className="flex flex-wrap gap-3">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 font-body text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o]
                    : selected.filter((s) => s !== o);
                  onChange(next.join(", "));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === "Sí"}
          onChange={(e) => onChange(e.target.checked ? "Sí" : "")}
        />
        <span className="font-body text-sm">{label}</span>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="admin-label">
        {label}
        {field.required === 1 && <span className="text-signal"> *</span>}
      </span>
      <input
        className="admin-input"
        type={field.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required === 1}
      />
    </label>
  );
}
