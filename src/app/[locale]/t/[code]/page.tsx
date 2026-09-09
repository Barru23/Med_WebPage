import { notFound } from "next/navigation";
import { getT, isLocale, type Locale } from "@/lib/i18n";
import { getTicketByCode } from "@/lib/queries";
import { qrSvg } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import { Stamp } from "@/components/marks";

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

export default async function TicketPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const l = locale as Locale;

  const ticket = await getTicketByCode(code);
  if (!ticket) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="font-mono text-sm text-ink/60">{t("ticket.notFound")}</p>
      </div>
    );
  }

  const activityTitle = pickField(
    {
      activity_title_ca: ticket.activity_title_ca,
      activity_title_es: ticket.activity_title_es,
      activity_title_en: ticket.activity_title_en,
    },
    "activity_title",
    l,
  );
  const variantName = pickField(
    {
      variant_name_ca: ticket.variant_name_ca,
      variant_name_es: ticket.variant_name_es,
      variant_name_en: ticket.variant_name_en,
    },
    "variant_name",
    l,
  );

  const pending = ticket.order_status === "pending";
  const inactive = ticket.order_status === "cancelled" || ticket.order_status === "refunded";

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-5 py-10">
      <div className="torn relative w-full border border-ink/15 bg-bone p-6 text-center">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-signal">
          {activityTitle}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight text-ink">{variantName}</h1>
        <p className="mt-1 font-mono text-xs text-ink/60">{ticket.buyer_name}</p>

        {pending && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <Stamp>{t("ticket.pendingTitle")}</Stamp>
            <p className="font-body text-sm text-ink/70">{t("ticket.pendingBody")}</p>
          </div>
        )}

        {inactive && (
          <div className="mt-6">
            <Stamp>{ticket.order_status}</Stamp>
          </div>
        )}

        {!pending && !inactive && (
          <>
            <div
              className="mx-auto mt-6 w-full max-w-[240px]"
              // Server-rendered QR SVG (src/lib/qr.ts) — no client JS needed.
              dangerouslySetInnerHTML={{ __html: await qrSvg(ticket.ticket_code) }}
            />
            {ticket.checked_in_at && (
              <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-widest text-signal">
                {t("ticket.checkedInAt")} · {formatDate(ticket.checked_in_at, l)}
              </p>
            )}
          </>
        )}

        <p className="mt-6 font-mono text-lg tracking-[0.3em] text-ink">
          {ticket.ticket_code}
        </p>
        {ticket.quantity > 1 && (
          <p className="mt-1 font-mono text-xs text-ink/70">×{ticket.quantity}</p>
        )}
      </div>
    </div>
  );
}
