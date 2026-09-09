import Link from "next/link";
import PendingDot from "@/components/Pending";
import { notFound } from "next/navigation";
import { getT, pick, isLocale, type Locale } from "@/lib/i18n";
import { getActivityBySlug, LAST_PLACES_THRESHOLD } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { Stamp, MarkerNote } from "@/components/marks";
import CheckoutForm from "./CheckoutForm";
import SizeGuideModal from "./SizeGuideModal";
import Image from "next/image";

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
  const { activity, variants, fields, images, sizeGuide } = data;

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
          className="press inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-ink/50 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-signal"
        >
          ← {deptName}
          <PendingDot />
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

      {activity.poster_url && (
        <Image
          src={activity.poster_url}
          alt={title}
          width={900}
          height={1100}
          priority
          unoptimized
          className="mt-5 h-auto max-h-[70vh] w-full border border-sand object-contain"
        />
      )}

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

      {images.length > 0 && (
        <section className="mt-8" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/50">
            {t("activity.gallery")}
          </h2>
          <div className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {images.map((galleryImage, index) => (
              <Image
                key={galleryImage.id}
                src={galleryImage.image_url}
                alt={galleryImage.alt_ca || `${title} ${index + 1}`}
                width={700}
                height={700}
                unoptimized
                className="aspect-square w-[82vw] max-w-sm shrink-0 snap-center border border-sand object-cover sm:w-full"
              />
            ))}
          </div>
        </section>
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
          {activity.type === "merch" && (sizeGuide.length > 0 || activity.size_guide_image_url) && (
            <SizeGuideModal
              rows={sizeGuide}
              imageUrl={activity.size_guide_image_url}
              strings={{
                title: t("activity.sizeGuide"),
                size: t("activity.size"),
                width: t("activity.width"),
                length: t("activity.length"),
                close: t("activity.close"),
                note: t("activity.sizeGuideNote"),
              }}
            />
          )}
        </div>
        <div className="mt-3">
          <CheckoutForm
            activitySlug={activity.slug}
            locale={l}
            variants={variants}
            fields={fields}
            maxPerOrder={activity.max_per_order}
            strings={{
              addOne: t("activity.addOne"),
              addTicket: t("activity.addTicket"),
              removeOne: t("activity.removeOne"),
              buy: t("activity.buy"),
              buyerName: t("activity.buyerName"),
              buyerPhone: t("activity.buyerPhone"),
              maxPerOrder: t("activity.maxPerOrder"),
              privacyLink: t("activity.privacyLink"),
              serviceFee: t("activity.serviceFee"),
              termsAccept: t("activity.termsAccept"),
              termsLink: t("activity.termsLink"),
              subtotal: t("activity.subtotal"),
              total: t("activity.total"),
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
