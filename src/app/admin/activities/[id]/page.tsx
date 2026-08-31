import { notFound } from "next/navigation";
import { getAdminActivity, listAllDepartments } from "@/lib/admin/queries";
import { duplicateActivity } from "@/lib/admin/actions/activities";
import ActivityForm from "../ActivityForm";
import DeleteActivityForm from "./DeleteActivityForm";
import type { VariantDraft, FieldDraft } from "@/lib/admin/activityForm";
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
  const { activity, variants, fields } = detail;

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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">{activity.title_ca}</h1>
        <form action={duplicateActivity.bind(null, activity.id)}>
          <button type="submit" className="admin-btn text-sm">
            Duplicar
          </button>
        </form>
      </div>

      <div className="mt-6">
        <ActivityForm
          departments={departments}
          activity={activity}
          initialVariants={initialVariants}
          initialFields={initialFields}
        />
      </div>

      <div className="mt-10 border-t border-sand pt-4">
        <DeleteActivityForm id={activity.id} orderCount={activity.order_count} />
      </div>
    </div>
  );
}
