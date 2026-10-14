"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { createActivity, updateActivity, type ActionState } from "@/lib/admin/actions/activities";
import {
  emptyVariant,
  toInputDatetime,
  type VariantDraft,
  type FieldDraft,
  type ActivityImageDraft,
  type SizeGuideRowDraft,
} from "@/lib/admin/activityForm";
import { DEFAULT_MAX_PER_ORDER } from "@/lib/orders";
import VariantEditor from "./VariantEditor";
import FieldEditor from "./FieldEditor";
import MediaEditor from "./MediaEditor";
import SizeGuideEditor from "./SizeGuideEditor";
import SubmitButton from "@/components/admin/SubmitButton";
import type { AdminDepartment, AdminActivityDetail } from "@/lib/admin/queries";

// El tipus no és una etiqueta: decideix com es lliura el que es ven. El
// marxandatge apareix a la pantalla de Recollida i la seva columna de Vendes
// diu "Recollit"; la resta es tanca a la Porta i diu "Check-in". Només el
// marxandatge té guia de talles. Per això les opcions es diuen pel que fan i
// no per la categoria: qui ompli el formulari no ha de saber-ne la teoria.
const TYPE_LABELS: Record<string, string> = {
  event: "Activitat o festa — s'entra amb el codi a la porta",
  merch: "Marxandatge — es recull en mà",
  trip: "Sortida o viatge — s'entra amb el codi a la porta",
};

const TYPE_HELP =
  "Tria com es lliura. El marxandatge és l'únic que surt a la pantalla de Recollida i l'únic que té guia de talles; la resta es valida a la Porta. No es pot canviar després de crear-la.";

export default function ActivityForm({
  departments,
  activity,
  initialVariants,
  initialFields,
  initialImages,
  initialSizeGuide,
}: {
  departments: AdminDepartment[];
  activity?: AdminActivityDetail;
  initialVariants?: VariantDraft[];
  initialFields?: FieldDraft[];
  initialImages?: ActivityImageDraft[];
  initialSizeGuide?: SizeGuideRowDraft[];
}) {
  const isEdit = Boolean(activity);
  const action = isEdit ? updateActivity : createActivity;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants && initialVariants.length > 0 ? initialVariants : [emptyVariant()],
  );
  const [fields, setFields] = useState<FieldDraft[]>(initialFields ?? []);
  const [images, setImages] = useState<ActivityImageDraft[]>(initialImages ?? []);
  const [sizeGuide, setSizeGuide] = useState<SizeGuideRowDraft[]>(initialSizeGuide ?? []);
  const [activityType, setActivityType] = useState(activity?.type ?? "event");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {activity && <input type="hidden" name="id" value={activity.id} />}
      <input type="hidden" name="variants_json" value={JSON.stringify(variants)} readOnly />
      <input type="hidden" name="fields_json" value={JSON.stringify(fields)} readOnly />
      <input type="hidden" name="gallery_json" value={JSON.stringify(images)} readOnly />
      <input type="hidden" name="size_guide_json" value={JSON.stringify(sizeGuide)} readOnly />

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
          <span className="admin-label">Com es lliura *</span>
          <select
            className="admin-select"
            name="type"
            defaultValue={activity?.type ?? "event"}
            onChange={(event) => setActivityType(event.target.value)}
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
          <span className="mt-1 block font-mono text-[0.7rem] leading-relaxed text-ink/70">
            {TYPE_HELP}
          </span>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
          <span className="admin-label">Final</span>
          <input
            type="datetime-local"
            className="admin-input"
            name="ends_at"
            defaultValue={toInputDatetime(activity?.ends_at ?? null)}
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
          <span className="admin-label">Màxim per compra</span>
          <input
            className="admin-input"
            name="max_per_order"
            type="number"
            min={1}
            max={100}
            placeholder={`en blanc = ${DEFAULT_MAX_PER_ORDER}`}
            defaultValue={activity?.max_per_order ?? ""}
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
          <input type="file" name="poster" accept="image/jpeg,image/png,image/webp" className="text-xs" />
        </label>
      </div>

      <section>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
          Modalitats
        </h2>
        <div className="mt-2">
          <VariantEditor variants={variants} onChange={setVariants} />
        </div>
      </section>

      <section>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
          Galeria de fotos
        </h2>
        <p className="mt-1 text-sm text-ink/60">Pots seleccionar diverses imatges alhora.</p>
        <div className="mt-2">
          <MediaEditor images={images} onChange={setImages} />
        </div>
      </section>

      {activityType === "merch" && (
        <section>
          <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
            Guia de talles
          </h2>
          <p className="mt-1 text-sm text-ink/60">Mesura la peça plana, d&apos;aixella a aixella i de dalt a baix.</p>
          <div className="mt-2">
            <SizeGuideEditor
              rows={sizeGuide}
              onChange={setSizeGuide}
              imageUrl={activity?.size_guide_image_url}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
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
          disabled={activity?.archived === 1}
          className="h-5 w-5"
        />
        <span className="font-body font-semibold">Publicada</span>
      </label>
      {activity?.archived === 1 && (
        <p className="font-mono text-xs text-signal">Restaura l&apos;activitat abans de publicar-la.</p>
      )}

      {state?.error && <p className="font-mono text-sm text-signal">{state.error}</p>}

      <div>
        <SubmitButton pendingText="Desant…">
          {isEdit ? "Desar canvis" : "Crear activitat"}
        </SubmitButton>
      </div>
    </form>
  );
}
