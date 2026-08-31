import Link from "next/link";
import { notFound } from "next/navigation";
import { getT, isLocale, type Locale } from "@/lib/i18n";
import { getOrderReceipt } from "@/lib/queries";

export const dynamic = "force-dynamic";

function pickField(
  row: Record<string, string | null>,
  base: string,
  locale: Locale,
): string {
  const localized = row[`${base}_${locale}`];
  if (typeof localized === "string" && localized.trim() !== "") return localized;
  return row[`${base}_ca`] ?? "";
}

export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const l = locale as Locale;

  const order = await getOrderReceipt(id);
  if (!order) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="font-mono text-sm text-ink/60">{t("order.notFound")}</p>
      </div>
    );
  }

  const activityTitle = pickField(
    {
      activity_title_ca: order.activity_title_ca,
      activity_title_es: order.activity_title_es,
      activity_title_en: order.activity_title_en,
    },
    "activity_title",
    l,
  );
  const pending = order.status === "pending";

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-signal">
        {activityTitle}
      </p>
      <h1 className="mt-1 font-display text-3xl tracking-tight text-ink">
        {t("order.title")}
      </h1>
      <p className="mt-1 font-mono text-xs text-ink/60">{order.buyer_name}</p>

      <p
        className={`mt-4 inline-block border px-3 py-1 font-mono text-xs uppercase tracking-widest ${
          pending ? "border-signal text-signal" : "border-ink text-ink"
        }`}
      >
        {pending ? t("order.pendingBanner") : t("order.paidBanner")}
      </p>

      {pending && <p className="mt-3 font-body text-sm text-ink/70">{t("ticket.pendingBody")}</p>}

      <h2 className="mt-8 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/50">
        {t("order.tickets")}
      </h2>
      <ul className="mt-3 divide-y divide-sand border-y border-sand">
        {order.items.map((item) => {
          const variantName = pickField(
            {
              variant_name_ca: item.variant_name_ca,
              variant_name_es: item.variant_name_es,
              variant_name_en: item.variant_name_en,
            },
            "variant_name",
            l,
          );
          return (
            <li key={item.ticket_code} className="flex items-center justify-between gap-3 py-3">
              <span className="font-body text-ink">
                {variantName}
                {item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </span>
              <Link
                href={`/${locale}/t/${item.ticket_code}`}
                className="font-mono text-xs uppercase tracking-widest text-signal underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                {t("order.viewTicket")} →
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
