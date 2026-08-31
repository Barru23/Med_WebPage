import Link from "next/link";
import { notFound } from "next/navigation";
import { getT, pick, isLocale, type Locale } from "@/lib/i18n";
import { getActivityBySlug, LAST_PLACES_THRESHOLD } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { Stamp, MarkerNote } from "@/components/marks";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const l = locale as Locale;

  const data = await getActivityBySlug(slug);
  if (!data) notFound();
  const { activity, variants, fields } = data;

  const title = pick(activity, "title", l);
  const description = pick(activity, "description", l);
  const deptName = pick(activity, "dept_name", l);
  const when = formatDate(activity.starts_at, l);
  const hasLastPlaces = variants.some(
    (v) => v.avail > 0 && v.avail <= LAST_PLACES_THRESHOLD,
  );

  return (
    <div className="mx-auto max-w-2xl px-5 pb-24">
      {/* Breadcrumb back to the department (Cartell). */}
      <div className="pt-4">
        <Link
          href={`/${locale}/d/${activity.dept_slug}`}
          className="font-mono text-xs uppercase tracking-widest text-ink/50 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-signal"
        >
          ← {deptName}
        </Link>
      </div>

      {/* Header — clinical record heading with a red stamp. */}
      <header className="relative border-b-2 border-ink pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-signal">
            {t(`type.${activity.type}`)}
            {activity.edition ? ` · ${activity.edition}` : ""}
          </p>
          <Stamp>{t("activity.sample")}</Stamp>
        </div>
        <h1 className="mt-2 font-display text-[clamp(2.5rem,11vw,4.5rem)] leading-[0.88] tracking-tight text-ink">
          {title}
        </h1>
      </header>

      {/* Meta — dotted-leader rows. */}
      {(when || activity.location) && (
        <dl className="mt-5 space-y-2">
          {when && <LeaderRow label={t("activity.when")} value={when} />}
          {activity.location && (
            <LeaderRow label={t("activity.where")} value={activity.location} />
          )}
        </dl>
      )}

      {/* Description. */}
      {description && (
        <p className="mt-6 max-w-prose font-body leading-relaxed text-ink/85">
          {description}
        </p>
      )}

      {/* Checkout — modalitats, custom fields and buyer details in one form. */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/50">
            {t("activity.modalitats")}
          </h2>
          {hasLastPlaces && (
            <MarkerNote className="text-base" rotate={-6}>
              {t("activity.lastPlaces")}
            </MarkerNote>
          )}
        </div>
        <div className="mt-3">
          <CheckoutForm
            activitySlug={activity.slug}
            locale={l}
            variants={variants}
            fields={fields}
            strings={{
              addTicket: t("activity.addTicket"),
              buy: t("activity.buy"),
              buyerName: t("activity.buyerName"),
              buyerPhone: t("activity.buyerPhone"),
              modalitats: t("activity.modalitats"),
              soldOut: t("activity.soldOut"),
              yourDetails: t("activity.yourDetails"),
            }}
          />
        </div>
      </section>
    </div>
  );
}

function LeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono text-xs uppercase tracking-widest text-ink/60">
        {label}
      </dt>
      <span aria-hidden className="leader" />
      <dd className="font-mono text-xs text-ink/80">{value}</dd>
    </div>
  );
}

