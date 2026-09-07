import { searchBuyers } from "@/lib/admin/queries";
import DoorScanner from "./DoorScanner";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendent de pagament",
  paid: "Pagat",
  cancelled: "Cancel·lat",
  refunded: "Reemborsat",
};

export default async function DoorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchBuyers(query) : [];

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl tracking-tight">Porta</h1>
      <p className="mt-1 font-mono text-xs text-ink/50">
        Escriu el codi de l&apos;entrada, o escaneja el QR si el porten.
      </p>
      <div className="mt-4">
        <DoorScanner />
      </div>

      <section className="mt-10 border-t border-sand pt-6">
        <h2 className="font-mono text-[0.7rem] uppercase tracking-widest text-ink/50">
          Ha perdut el codi
        </h2>
        <p className="mt-1 font-body text-sm text-ink/60">
          Cerca pel nom o el correu i llegeix-li el codi.
        </p>

        <form method="get" className="mt-3 flex gap-2">
          <input
            className="admin-input"
            name="q"
            defaultValue={query}
            placeholder="Nom o correu…"
          />
          <button type="submit" className="admin-btn">
            Cerca
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          {query && results.length === 0 && (
            <p className="font-mono text-sm text-ink/50">Cap resultat per &quot;{query}&quot;.</p>
          )}
          {results.map((r) => (
            <div key={r.order_item_id} className="admin-card p-3">
              <p className="font-mono text-xl tracking-[0.3em] text-ink">{r.ticket_code}</p>
              <p className="mt-1 font-body font-semibold">{r.buyer_name}</p>
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/50">
                {r.activity_title} · {r.variant_name} ×{r.quantity}
              </p>
              <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-widest">
                <span className={r.order_status === "paid" ? "text-ink/50" : "text-signal"}>
                  {STATUS_LABELS[r.order_status] ?? r.order_status}
                </span>
                {r.checked_in_at && <span className="text-signal"> · ja ha entrat</span>}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
