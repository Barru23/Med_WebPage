import { notFound } from "next/navigation";
import { getAdminActivity, listAllDepartments } from "@/lib/admin/queries";
import { duplicateActivity, setActivityArchived } from "@/lib/admin/actions/activities";
import ActivityForm from "../ActivityForm";
import DeleteActivityForm from "./DeleteActivityForm";
import type {
  VariantDraft,
  FieldDraft,
  SizeGuideRowDraft,
} from "@/lib/admin/activityForm";
import { centsToEuros, toInputDatetime } from "@/lib/admin/activityForm";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    if (f.options_json) {
      try {
        const parsed = JSON.parse(f.options_json);
        options = Array.isArray(parsed)
          ? parsed.map((o) => (typeof o === "string" ? o : o.ca ?? o.value ?? "")).join("\n")
          : "";
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
      required: f.required === 1,
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
        <div className="flex gap-2">
          <form action={setActivityArchived.bind(null, activity.id, activity.archived !== 1)}>
            <button type="submit" className={activity.archived === 1 ? "admin-btn text-sm" : "admin-btn admin-btn-danger text-sm"}>
              {activity.archived === 1 ? "Restaurar" : "Arxivar"}
            </button>
          </form>
          <form action={duplicateActivity.bind(null, activity.id)}>
            <button type="submit" className="admin-btn text-sm">
              Duplicar
            </button>
          </form>
        </div>
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

      <div className="mt-10 border-t border-sand pt-4">
        <DeleteActivityForm id={activity.id} orderCount={activity.order_count} />
      </div>
    </div>
  );
}
