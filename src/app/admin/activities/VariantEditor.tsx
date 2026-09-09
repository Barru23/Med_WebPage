"use client";

import { emptyVariant, type VariantDraft } from "@/lib/admin/activityForm";

export default function VariantEditor({
  variants,
  onChange,
}: {
  variants: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
}) {
  function update(i: number, patch: Partial<VariantDraft>) {
    onChange(variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function remove(i: number) {
    onChange(variants.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      {variants.map((v, i) => (
        <div key={i} className="admin-card grid grid-cols-1 gap-2 p-3 sm:grid-cols-12 sm:items-end">
          <label className="block sm:col-span-3">
            <span className="admin-label">Nom (CA) *</span>
            <input
              className="admin-input"
              value={v.name_ca}
              onChange={(e) => update(i, { name_ca: e.target.value })}
              required
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="admin-label">Nom (ES)</span>
            <input
              className="admin-input"
              value={v.name_es}
              onChange={(e) => update(i, { name_es: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="admin-label">Nom (EN)</span>
            <input
              className="admin-input"
              value={v.name_en}
              onChange={(e) => update(i, { name_en: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="admin-label">Preu €</span>
            <input
              className="admin-input"
              inputMode="decimal"
              pattern="[0-9]+([,.][0-9]{1,2})?"
              title="Escriu un import com 12,50"
              value={v.price_euros}
              onChange={(e) => update(i, { price_euros: e.target.value })}
              required
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="admin-label">Estoc</span>
            <input
              className="admin-input"
              inputMode="numeric"
              value={v.stock}
              onChange={(e) => update(i, { stock: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="admin-label">Venda des de</span>
            <input
              type="datetime-local"
              className="admin-input"
              value={v.sale_start}
              onChange={(e) => update(i, { sale_start: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="admin-label">Venda fins</span>
            <input
              type="datetime-local"
              className="admin-input"
              value={v.sale_end}
              onChange={(e) => update(i, { sale_end: e.target.value })}
            />
          </label>
          <div className="sm:col-span-1">
            {v.sold > 0 ? (
              <span className="block font-mono text-[0.65rem] text-ink/70">
                {v.sold} venud{v.sold === 1 ? "a" : "es"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => remove(i)}
                className="admin-btn admin-btn-danger w-full text-xs"
              >
                Treure
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...variants, emptyVariant()])}
        className="admin-btn self-start text-sm"
      >
        + Afegir modalitat
      </button>
    </div>
  );
}
