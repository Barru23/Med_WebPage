import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { getOperationalOverview } from "@/lib/admin/queries";
import { reconcilePendingOrder } from "@/lib/admin/actions/operations";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireAdminPage();
  const overview = await getOperationalOverview();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl tracking-tight">Operacions</h1>
      <p className="mt-1 font-mono text-xs text-ink/70">
        Incidències que necessiten reintent o revisió humana.
      </p>

      <section className="mt-8">
        <h2 className="admin-label">Comandes pendents més de 50 minuts</h2>
        <div className="mt-2 flex flex-col gap-2">
          {overview.pendingOrders.map((order) => (
            <div key={order.id} className="admin-card flex flex-wrap items-center gap-3 p-3">
              <span className="flex-1 font-mono text-xs">
                {order.activity_title} · {order.buyer_email}<br />{order.id}
              </span>
              <form action={reconcilePendingOrder.bind(null, order.id)}>
                <button className="admin-btn text-xs" type="submit">Consultar Stripe</button>
              </form>
            </div>
          ))}
          {overview.pendingOrders.length === 0 && <p className="font-mono text-xs">Cap.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="admin-label">Webhooks fallits o encallats</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <tbody>
              {overview.webhookIssues.map((event) => (
                <tr key={event.id} className="border-b border-sand">
                  <td className="py-2 pr-3">{event.type}<br />{event.id}</td>
                  <td className="py-2 pr-3">{event.processing_status} · {event.attempts} intents</td>
                  <td className="py-2 text-signal">{event.last_error ?? "Processament interromput"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {overview.webhookIssues.length === 0 && <p className="font-mono text-xs">Cap.</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="admin-label">Lliuraments incomplets</h2>
        <div className="mt-2 flex flex-col gap-2">
          {overview.relayIssues.map((order) => (
            <div key={order.id} className="admin-card p-3 font-mono text-xs">
              {order.activity_title} · {order.buyer_email}<br />
              Full: {order.relay_sheet_status} · Correu: {order.relay_email_status}
              {order.relay_last_error && <p className="mt-1 text-signal">{order.relay_last_error}</p>}
              <Link
                className="mt-2 inline-block underline"
                href={`/admin/sales/${order.activity_slug}${
                  order.edition ? `?edition=${encodeURIComponent(order.edition)}` : ""
                }`}
              >
                Obrir vendes i reintentar
              </Link>
            </div>
          ))}
          {overview.relayIssues.length === 0 && <p className="font-mono text-xs">Cap.</p>}
        </div>
      </section>
    </div>
  );
}
