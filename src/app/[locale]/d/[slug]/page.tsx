import Link from "next/link";
import PendingDot from "@/components/Pending";
import { notFound } from "next/navigation";
import { getT, pick, isLocale, type Locale } from "@/lib/i18n";
import {
  getDepartmentBySlug,
  LAST_PLACES_THRESHOLD,
  type DeptActivity,
} from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import SeamWord from "@/components/SeamWord";
import { Stamp, MarkerNote } from "@/components/marks";

export const dynamic = "force-dynamic";

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const l = locale as Locale;

  const data = await getDepartmentBySlug(slug);
  if (!data) notFound();
  const { department, activities } = data;
  const name = pick(department, "name", l);

  // Only the first "últimes places" activity gets the one Permanent-Marker note.
  const markerId = activities.find(
    (a) => a.avail > 0 && a.avail <= LAST_PLACES_THRESHOLD,
  )?.id;

  return (
    <div className="pb-16">
      {/* Back to the contact sheet. */}
      <div className="px-5 pt-4">
        <Link
          href={`/${locale}`}
          className="press inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-ink/70 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-signal"
        >
          ← {t("department.back")}
          <PendingDot />
        </Link>
      </div>

      {/* Cartell header — Bodoni sliced across the seam grid, bleeding right. */}
      <header className="-mr-5 overflow-hidden px-5 pt-6 pb-8">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-signal">
          {t("department.activities")}
        </p>
        <SeamWord className="mt-2 text-[clamp(3rem,18vw,9rem)] tracking-tight text-ink">
          {name}
        </SeamWord>
      </header>

      {activities.length === 0 ? (
        <p className="px-5 font-mono text-sm uppercase tracking-widest text-ink/70">
          {t("department.noOpenActivities")}
        </p>
      ) : (
        <section className="grid grid-cols-1 gap-5 px-5 sm:grid-cols-2">
          {activities.map((a) => (
            <ActivityTile
              key={a.id}
              activity={a}
              locale={locale}
              l={l}
              t={t}
              showMarker={a.id === markerId}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function ActivityTile({
  activity,
  locale,
  l,
  t,
  showMarker,
}: {
  activity: DeptActivity;
  locale: string;
  l: Locale;
  t: (k: string) => string;
  showMarker: boolean;
}) {
  const soldOut = activity.avail <= 0;
  const title = pick(activity, "title", l);

  return (
    <Link
      href={`/${locale}/a/${activity.slug}`}
      className="press group relative block outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      {/* Paper stack behind the torn tile. */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-1 translate-y-1.5 bg-sand torn"
      />
      <article
        className={`torn relative flex min-h-44 flex-col justify-between border border-ink/15 bg-bone p-4 ${
          soldOut ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/70">
            {t(`type.${activity.type}`)}
          </span>
          {soldOut && <Stamp>{t("department.soldOut")}</Stamp>}
          {showMarker && !soldOut && (
            <MarkerNote className="text-base" rotate={-8}>
              {t("department.lastPlaces")}
            </MarkerNote>
          )}
        </div>

        <h2 className="mt-3 font-display text-[clamp(1.75rem,7vw,2.75rem)] leading-[0.9] tracking-tight text-ink">
          {title}
        </h2>

        <div className="mt-4 pb-2 font-mono text-xs text-ink/70">
          {activity.min_price != null && !soldOut && (
            <span>
              {t("department.from")} {formatPrice(activity.min_price, l)}
            </span>
          )}
        </div>
      </article>
    </Link>
  );
}
