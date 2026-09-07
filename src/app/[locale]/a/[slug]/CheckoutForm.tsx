"use client";

import { useActionState, useId, useState } from "react";
import { submitOrder, type CheckoutState } from "@/lib/actions/checkout";
import { formatPrice } from "@/lib/format";
import SubmitButton from "@/components/admin/SubmitButton";
import { pick, type Locale } from "@/lib/i18n";
import type { Variant, Field } from "@/lib/queries";

interface TicketLine {
  uid: string;
  variantId: string;
  answers: Record<string, string>;
}

function parseOptions(field: Field): string[] {
  if (!field.options_json) return [];
  try {
    const parsed = JSON.parse(field.options_json) as unknown[];
    return parsed.map((o) =>
      typeof o === "string"
        ? o
        : ((o as Record<string, string>).ca ?? (o as Record<string, string>).value ?? ""),
    );
  } catch {
    return [];
  }
}

export interface CheckoutStrings {
  addTicket: string;
  maxPerOrder: string;
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
    return <p className="font-mono text-sm text-ink/50">{strings.soldOut}</p>;
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

  const unitsSoFar = hasFields
    ? lines.length
    : Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const capReached = maxPerOrder !== null && unitsSoFar >= maxPerOrder;

  const linesPayload = hasFields
    ? lines.map((l) => ({ variantId: l.variantId, quantity: 1, answers: l.answers }))
    : Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([variantId, quantity]) => ({ variantId, quantity, answers: {} }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lines_json" value={JSON.stringify(linesPayload)} readOnly />

      {maxPerOrder !== null && (
        <p className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/50">
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
              <input
                type="number"
                min={0}
                max={v.avail}
                value={quantities[v.id] ?? 0}
                onChange={(e) =>
                  setQuantities((prev) => {
                    const current = prev[v.id] ?? 0;
                    const others = unitsSoFar - current;
                    const room =
                      maxPerOrder === null ? v.avail : Math.min(v.avail, maxPerOrder - others);
                    return {
                      ...prev,
                      [v.id]: Math.max(0, Math.min(room, Number(e.target.value) || 0)),
                    };
                  })
                }
                className="admin-input w-16 text-center"
                aria-label={pick(v, "name", locale)}
              />
            </li>
          ))}
        </ul>
      )}

      {hasFields && (
        <div className="flex flex-col gap-5">
          {lines.map((line, i) => (
            <div key={line.uid} className="admin-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/50">
                  {strings.modalitats} #{i + 1}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}
                    className="font-mono text-[0.65rem] uppercase tracking-widest text-signal"
                  >
                    Treure
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
        <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/50">
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

      {state?.error && <p className="font-mono text-sm text-signal">{state.error}</p>}

      <div className="flex items-center gap-4">
        <SubmitButton className="admin-btn admin-btn-primary text-base" pendingText="Enviant…">
          {strings.buy} · {formatPrice(total, locale)}
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
  const options = parseOptions(field);

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
