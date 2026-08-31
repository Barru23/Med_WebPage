import Link from "next/link";
import { listAllActivities } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  event: "Activitat",
  merch: "Marxandatge",
  trip: "Sortida",
};

export default async function AdminActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ arxivades?: string }>;
}) {
  const { arxivades } = await searchParams;
  const showArchived = arxivades === "1";

  const all = await listAllActivities();
  const rows = all.filter((a) => (showArchived ? a.published === 0 : a.published === 1));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">Activitats</h1>
        <Link href="/admin/activities/new" className="admin-btn admin-btn-primary">
          + Nova activitat
        </Link>
      </div>

      <div className="mt-4 flex gap-2 font-mono text-xs uppercase tracking-widest">
        <Link
          href="/admin/activities"
          className={`border px-3 py-1.5 ${
            !showArchived ? "border-ink text-ink" : "border-sand text-ink/50"
          }`}
        >
          Actives
        </Link>
        <Link
          href="/admin/activities?arxivades=1"
          className={`border px-3 py-1.5 ${
            showArchived ? "border-ink text-ink" : "border-sand text-ink/50"
          }`}
        >
          Arxivades
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="font-mono text-sm text-ink/50">Cap activitat aquí.</p>
        )}
        {rows.map((a) => (
          <div
            key={a.id}
            className="admin-card flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <div>
              <p className="font-body font-semibold">{a.title_ca}</p>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/50">
                {a.dept_name_ca} · {TYPE_LABELS[a.type] ?? a.type}
                {a.edition ? ` · ${a.edition}` : ""}
                {a.order_count > 0 ? ` · ${a.order_count} comandes` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/sales/${a.slug}`}
                className="admin-btn text-xs"
              >
                Vendes
              </Link>
              <Link href={`/admin/activities/${a.id}`} className="admin-btn text-xs">
                Editar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
