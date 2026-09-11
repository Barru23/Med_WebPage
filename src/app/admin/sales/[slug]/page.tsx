import Link from "next/link";
import { notFound } from "next/navigation";
import { getSales } from "@/lib/admin/queries";
import { formatDate, formatPrice } from "@/lib/format";
import { LIVE_SHEET_URL, sheetTabName } from "@/lib/sheet";
import MarkPaidButton from "./MarkPaidButton";
import ResyncButton from "./ResyncButton";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendent",
  paid: "Pagat",
  cancelled: "Cancel·lat",
  refunded: "Reemborsat",
};

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edition?: string }>;
}) {
  await requireAdminPage();
  const { slug } = await params;
  const { edition } = await searchParams;
  const sales = await getSales(slug, edition);
  if (!sales) notFound();

  const isMerch = sales.activity.type === "merch";

  const exportHref = `/admin/sales/${slug}/export${
    sales.currentEdition ? `?edition=${encodeURIComponent(sales.currentEdition)}` : ""
  }`;

  // The tab the relay writes this activity's orders to. Naming it saves the
  // admin from scrolling a sheet with one tab per activity and edition.
  const tabName = sheetTabName(sales.activity.title_ca, sales.currentEdition);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl tracking-tight">{sales.activity.title_ca}</h1>

      {sales.editions.length > 1 && (
        <form className="mt-3 flex items-center gap-2" method="get">
          <span className="admin-label !mb-0">Edició</span>
          <select name="edition" defaultValue={sales.currentEdition ?? ""} className="admin-select w-auto">
            {sales.editions.map((ed) => (
              <option key={ed} value={ed}>
                {ed}
              </option>
            ))}
          </select>
          <button type="submit" className="admin-btn text-xs">
            Veure
          </button>
        </form>
      )}
      {sales.currentEdition && (
        <p className="mt-1 font-mono text-xs text-ink/70">Edició: {sales.currentEdition}</p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="admin-card p-4 text-center">
          <p className="font-display text-3xl">{sales.sold}</p>
          <p className="admin-label !mb-0">Venudes</p>
        </div>
        <div className="admin-card p-4 text-center">
          <p className="font-display text-3xl">{formatPrice(sales.revenue_cents, "ca")}</p>
          <p className="admin-label !mb-0">Ingressos</p>
        </div>
        <div className="admin-card p-4 text-center">
          <p className="font-display text-3xl">{sales.remaining}</p>
          <p className="admin-label !mb-0">Disponibles</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <a href={exportHref} className="admin-btn admin-btn-primary">
          Excel de pagades
        </a>
        <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}include=all`} className="admin-btn">
          Excel complet
        </a>
        <a
          href={LIVE_SHEET_URL}
          target="_blank"
          rel="noreferrer"
          className="admin-btn"
          title={`Obre el full compartit. La pestanya d’aquesta activitat es diu «${tabName}».`}
        >
          Full de Google en directe
        </a>
      </div>

      <p className="mt-2 font-mono text-xs text-ink/70">
        L’Excel es genera de la base de dades cada vegada que el prems. El full de Google és una
        còpia que s’actualitza a cada comanda pagada, còmode per compartir, i pot quedar enrere
        si la sincronització falla.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-ink text-left uppercase tracking-widest text-ink/60">
              <th className="py-2 pr-3">Comprador</th>
              <th className="py-2 pr-3">Modalitat</th>
              <th className="py-2 pr-3">Codi</th>
              <th className="py-2 pr-3">Estat</th>
              <th className="py-2 pr-3">{isMerch ? "Recollit" : "Check-in"}</th>
              <th className="py-2 pr-3" title="Fila al full de Google i correu al comprador">
                Full / correu
              </th>
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {sales.buyers.map((b) => (
              <tr key={b.ticket_code} className="border-b border-sand">
                <td className="py-2 pr-3">
                  {b.buyer_name}
                  <br />
                  <span className="text-ink/70">{b.buyer_email}</span>
                </td>
                <td className="py-2 pr-3">
                  {b.variant_name} ×{b.quantity}
                </td>
                <td className="py-2 pr-3">{b.ticket_code}</td>
                <td className="py-2 pr-3">
                  {STATUS_LABELS[b.status] ?? b.status}
                  {b.dispute_status === "open" && (
                    <span className="block text-signal">Disputa oberta</span>
                  )}
                  {b.dispute_status === "won" && <span className="block">Disputa guanyada</span>}
                  {b.dispute_status === "lost" && <span className="block">Disputa perduda</span>}
                  {b.refunded_cents > 0 && b.status === "paid" && (
                    <span className="block">Parcial: −{formatPrice(b.refunded_cents, "ca")}</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {(isMerch ? b.collected_at : b.checked_in_at) ? "✓" : "—"}
                </td>
                <td className="py-2 pr-3">
                  {b.status !== "paid" ? (
                    "—"
                  ) : (
                    <span
                      className={
                        b.relay_sheet_status === "sent" && b.relay_email_status === "sent"
                          ? ""
                          : "text-signal"
                      }
                    >
                      Full: {b.relay_sheet_status === "sent" ? "✓" : "pendent"}
                      {" · "}
                      Correu: {
                        b.relay_email_status === "sent"
                          ? "✓"
                          : b.relay_email_status === "unknown"
                            ? "?"
                            : "pendent"
                      }
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">{formatDate(b.created_at, "ca")}</td>
                <td className="py-2 pr-3">
                  {b.status === "pending" && b.payment_method === "manual" && (
                    <MarkPaidButton orderId={b.order_id} />
                  )}
                  {b.status === "paid" && (
                    <ResyncButton
                      orderId={b.order_id}
                      sheetStatus={b.relay_sheet_status}
                      emailStatus={b.relay_email_status}
                    />
                  )}
                </td>
              </tr>
            ))}
            {sales.buyers.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-ink/70">
                  Encara no hi ha comandes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <Link href="/admin/activities" className="font-mono text-xs uppercase tracking-widest text-ink/70">
          ← Activitats
        </Link>
      </div>
    </div>
  );
}
