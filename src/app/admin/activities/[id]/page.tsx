import { notFound } from "next/navigation";
import { getAdminActivity, listAllDepartments } from "@/lib/admin/queries";
import { createActivityEdition } from "@/lib/admin/actions/activities";
import ActivityForm from "../ActivityForm";
import DeleteActivityForm from "./DeleteActivityForm";
import type {
  VariantDraft,
  FieldDraft,
  SizeGuideRowDraft,
} from "@/lib/admin/activityForm";
import { centsToEuros, toInputDatetime } from "@/lib/admin/activityForm";
import { requireAdminPage } from "@/lib/auth";
import ActivityActions from "./ActivityActions";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const [detail, departments] = await Promise.all([
    getAdminActivity(id),
    listAllDepartments(),
  ]);
  if (!detail) notFound();
  const { activity, variants, fields, images } = detail;

  const initialVariants: VariantDraft[] = variants.map((v) => ({
    id: v.id,
    name_ca: v.name_ca,
    name_es: v.name_es ?? "",
    name_en: v.name_en ?? "",
    price_euros: centsToEuros(v.price_cents),
    stock: String(v.stock),
    sold: v.sold,
    sale_start: toInputDatetime(v.sale_start),
    sale_end: toInputDatetime(v.sale_end),
  }));

  const initialFields: FieldDraft[] = fields.map((f) => {
    let options = "";
    let optionsEs = "";
    let optionsEn = "";
    if (f.options_json) {
      try {
        const parsed = JSON.parse(f.options_json);
        if (Array.isArray(parsed)) {
          options = parsed.map((o) => (typeof o === "string" ? o : o.ca ?? o.value ?? "")).join("\n");
          optionsEs = parsed.map((o) => (typeof o === "string" ? "" : o.es ?? "")).join("\n");
          optionsEn = parsed.map((o) => (typeof o === "string" ? "" : o.en ?? "")).join("\n");
        }
      } catch {
        options = "";
      }
    }
    return {
      id: f.id,
      label_ca: f.label_ca,
      label_es: f.label_es ?? "",
      label_en: f.label_en ?? "",
      type: f.type as FieldDraft["type"],
      options,
      options_es: optionsEs,
      options_en: optionsEn,
      required: f.required === 1,
      data_classification: f.data_classification,
    };
  });

  let initialSizeGuide: SizeGuideRowDraft[] = [];
  try {
    const parsed = JSON.parse(activity.size_guide_json ?? "[]");
    if (Array.isArray(parsed)) {
      initialSizeGuide = parsed.map((row) => ({
        size: String(row.size ?? ""),
        width_cm: String(row.width_cm ?? ""),
        length_cm: String(row.length_cm ?? ""),
      }));
    }
  } catch {
    initialSizeGuide = [];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">{activity.title_ca}</h1>
        <ActivityActions id={activity.id} archived={activity.archived === 1} />
      </div>

      <div className="mt-6">
        <ActivityForm
          departments={departments}
          activity={activity}
          initialVariants={initialVariants}
          initialFields={initialFields}
          initialImages={images.map((image) => ({
            id: image.id,
            image_url: image.image_url,
            alt_ca: image.alt_ca ?? "",
          }))}
          initialSizeGuide={initialSizeGuide}
        />
      </div>

      <form
        action={createActivityEdition}
        className="mt-10 flex flex-col gap-2 border-t border-sand pt-4 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="activity_id" value={activity.id} />
        <label className="block flex-1">
          <span className="admin-label">Nova edició</span>
          <input
            className="admin-input"
            name="edition_label"
            placeholder="Primavera 2027"
            required
          />
        </label>
        <button
          type="submit"
          className="admin-btn"
          title="Copia les modalitats i crea un inventari nou sense publicar-lo"
        >
          Crear i activar edició
        </button>
      </form>

      <div className="mt-10 border-t border-sand pt-4">
        <DeleteActivityForm id={activity.id} orderCount={activity.order_count} />
      </div>
    </div>
  );
}
