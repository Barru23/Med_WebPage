"use client";

import { emptyField, type FieldDraft } from "@/lib/admin/activityForm";

const TYPES: FieldDraft["type"][] = ["text", "number", "select", "checkbox"];

export default function FieldEditor({
  fields,
  onChange,
}: {
  fields: FieldDraft[];
  onChange: (next: FieldDraft[]) => void;
}) {
  function update(i: number, patch: Partial<FieldDraft>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    onChange(fields.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f, i) => (
        <div key={i} className="admin-card flex flex-col gap-2 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
            <label className="block sm:col-span-3">
              <span className="admin-label">Pregunta (CA) *</span>
              <input
                className="admin-input"
                value={f.label_ca}
                onChange={(e) => update(i, { label_ca: e.target.value })}
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="admin-label">Pregunta (ES)</span>
              <input
                className="admin-input"
                value={f.label_es}
                onChange={(e) => update(i, { label_es: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="admin-label">Pregunta (EN)</span>
              <input
                className="admin-input"
                value={f.label_en}
                onChange={(e) => update(i, { label_en: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="admin-label">Tipus</span>
              <select
                className="admin-select"
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as FieldDraft["type"] })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 sm:col-span-2">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              <span className="font-mono text-xs">Obligatori</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="admin-label">Dades</span>
              <select
                className="admin-select"
                value={f.data_classification}
                onChange={(e) =>
                  update(i, {
                    data_classification: e.target.value as FieldDraft["data_classification"],
                  })
                }
              >
                <option value="standard">Ordinàries</option>
                <option value="identity">Identitat / DNI</option>
                <option value="health">Salut / al·lèrgies</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => remove(i)}
              className="admin-btn admin-btn-danger sm:col-span-1"
            >
              Treure
            </button>
          </div>
          {(f.type === "select" || f.type === "checkbox") && (
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["options", "Opcions CA"],
                ["options_es", "Opcions ES"],
                ["options_en", "Opcions EN"],
              ] as const).map(([key, label]) => (
                <label className="block" key={key}>
                  <span className="admin-label">{label} (una per línia)</span>
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    value={f[key]}
                    onChange={(e) => update(i, { [key]: e.target.value })}
                    placeholder={"Girona\nFigueres\nBarcelona"}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyField()])}
        className="admin-btn self-start text-sm"
      >
        + Afegir pregunta
      </button>
    </div>
  );
}
