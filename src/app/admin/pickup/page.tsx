import { searchPickup } from "@/lib/admin/queries";
import CollectToggle from "./CollectToggle";

export const dynamic = "force-dynamic";

export default async function PickupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q && q.trim() ? await searchPickup(q.trim()) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl tracking-tight">Recollida</h1>
      <p className="mt-1 font-mono text-xs text-ink/50">
        Cerca pel nom del comprador i marca com a recollit.
      </p>

      <form method="get" className="mt-4 flex gap-2">
        <input
          className="admin-input"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nom del comprador…"
          autoFocus
        />
        <button type="submit" className="admin-btn admin-btn-primary">
          Cerca
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2">
        {q && results.length === 0 && (
          <p className="font-mono text-sm text-ink/50">Cap resultat per &quot;{q}&quot;.</p>
        )}
        {results.map((r) => (
          <div
            key={r.order_item_id}
            className="admin-card flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <div>
              <p className="font-body font-semibold">{r.buyer_name}</p>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/50">
                {r.activity_title} · {r.variant_name} ×{r.quantity}
              </p>
            </div>
            <CollectToggle orderItemId={r.order_item_id} collected={r.checked_in_at !== null} />
          </div>
        ))}
      </div>
    </div>
  );
}
