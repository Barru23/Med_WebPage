"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { createActivity, updateActivity, type ActionState } from "@/lib/admin/actions/activities";
import {
  emptyVariant,
  toInputDatetime,
  type VariantDraft,
  type FieldDraft,
} from "@/lib/admin/activityForm";
import VariantEditor from "./VariantEditor";
import FieldEditor from "./FieldEditor";
import SubmitButton from "@/components/admin/SubmitButton";
import type { AdminDepartment, AdminActivityDetail } from "@/lib/admin/queries";

const TYPE_LABELS: Record<string, string> = {
  event: "Activitat",
  merch: "Marxandatge",
  trip: "Sortida",
};

export default function ActivityForm({
  departments,
  activity,
  initialVariants,
  initialFields,
}: {
  departments: AdminDepartment[];
  activity?: AdminActivityDetail;
  initialVariants?: VariantDraft[];
  initialFields?: FieldDraft[];
}) {
  const isEdit = Boolean(activity);
  const action = isEdit ? updateActivity : createActivity;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants && initialVariants.length > 0 ? initialVariants : [emptyVariant()],
  );
  const [fields, setFields] = useState<FieldDraft[]>(initialFields ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <input type="hidden" name="variants_json" value={JSON.stringify(variants)} readOnly />
      <input type="hidden" name="fields_json" value={JSON.stringify(fields)} readOnly />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="admin-label">Departament *</span>
          <select
            className="admin-select"
            name="department_id"
            defaultValue={activity?.department_id ?? departments[0]?.id}
            required
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_ca}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="admin-label">Tipus *</span>
          <select
            className="admin-select"
            name="type"
            defaultValue={activity?.type ?? "event"}
            disabled={isEdit}
            required
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {isEdit && <input type="hidden" name="type" value={activity!.type} />}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="admin-label">Títol (CA) *</span>
          <input className="admin-input" name="title_ca" defaultValue={activity?.title_ca} required />
        </label>
        <label className="block">
          <span className="admin-label">Títol (ES)</span>
          <input className="admin-input" name="title_es" defaultValue={activity?.title_es ?? ""} />
        </label>
        <label className="block">
          <span className="admin-label">Títol (EN)</span>
          <input className="admin-input" name="title_en" defaultValue={activity?.title_en ?? ""} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="admin-label">Descripció (CA)</span>
          <textarea
            className="admin-textarea"
            name="description_ca"
            rows={3}
            defaultValue={activity?.description_ca ?? ""}
          />
        </label>
        <label className="block">
          <span className="admin-label">Descripció (ES)</span>
          <textarea
            className="admin-textarea"
            name="description_es"
            rows={3}
            defaultValue={activity?.description_es ?? ""}
          />
        </label>
        <label className="block">
          <span className="admin-label">Descripció (EN)</span>
          <textarea
            className="admin-textarea"
            name="description_en"
            rows={3}
            defaultValue={activity?.description_en ?? ""}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="admin-label">Data</span>
          <input
            type="datetime-local"
            className="admin-input"
            name="starts_at"
            defaultValue={toInputDatetime(activity?.starts_at ?? null)}
          />
        </label>
        <label className="block">
          <span className="admin-label">Lloc</span>
          <input className="admin-input" name="location" defaultValue={activity?.location ?? ""} />
        </label>
        <label className="block">
          <span className="admin-label">Edició</span>
          <input
            className="admin-input"
            name="edition"
            placeholder="Tardor 2026"
            defaultValue={activity?.edition ?? ""}
          />
        </label>
        <label className="block">
          <span className="admin-label">Cartell</span>
          {activity?.poster_url && (
            <Image
              src={activity.poster_url}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="mb-1 h-10 w-10 border border-sand object-cover"
            />
          )}
          <input type="file" name="poster" accept="image/*" className="text-xs" />
        </label>
      </div>

      <section>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/50">
          Modalitats
        </h2>
        <div className="mt-2">
          <VariantEditor variants={variants} onChange={setVariants} />
        </div>
      </section>

      <section>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/50">
          Preguntes addicionals (opcional)
        </h2>
        <div className="mt-2">
          <FieldEditor fields={fields} onChange={setFields} />
        </div>
      </section>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="published"
          defaultChecked={activity ? activity.published === 1 : false}
          className="h-5 w-5"
        />
        <span className="font-body font-semibold">Publicada</span>
      </label>

      {state?.error && <p className="font-mono text-sm text-signal">{state.error}</p>}

      <div>
        <SubmitButton pendingText="Desant…">
          {isEdit ? "Desar canvis" : "Crear activitat"}
        </SubmitButton>
      </div>
    </form>
  );
}
