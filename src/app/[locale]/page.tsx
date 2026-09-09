import Link from "next/link";
import { getT, pick, isLocale, type Locale } from "@/lib/i18n";
import { listDepartments, listOnSale } from "@/lib/queries";
import { MarkerNote } from "@/components/marks";
import { notFound } from "next/navigation";
import BrandLockup from "@/components/BrandLockup";
import DepartmentGrid from "@/components/DepartmentGrid";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const l = locale as Locale;

  const [departments, onSale] = await Promise.all([
    listDepartments(),
    listOnSale(),
  ]);

  return (
    <div className="px-5 pb-16">
      {/* Hero — Bodoni bleeding off the left edge. */}
      <section className="-mx-5 overflow-hidden pt-8 pb-6 pl-5">
        <h1>
          <BrandLockup />
        </h1>
      </section>

      {/* Contact sheet — grid of department frames. */}
      <section>
        <DepartmentGrid
          locale={locale}
          departments={departments.map((department) => ({
            id: department.id,
            slug: department.slug,
            name: pick(department, "name", l),
            openCount: department.open_count,
          }))}
          noOpenActivities={t("home.noOpenActivities")}
        />
      </section>

      {/* Thin mono strip — what is on sale right now (CLAUDE.md §8). */}
      <section className="mt-8 border-t border-sand pt-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-signal">
            {t("home.onSaleNow")}
          </h2>
          {onSale.length === 0 ? (
            <p className="font-mono text-xs text-ink/70">
              {t("home.nothingOnSale")}
            </p>
          ) : (
            <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-xs">
              {onSale.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/${locale}/a/${a.slug}`}
                    className="text-ink/70 underline decoration-sand underline-offset-4 outline-none hover:text-ink hover:decoration-signal focus-visible:ring-2 focus-visible:ring-signal"
                  >
                    {pick(a, "title", l)}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {onSale.length > 0 && (
            <MarkerNote className="ml-auto text-lg" rotate={-5}>
              {t("home.look")}
            </MarkerNote>
          )}
        </div>
      </section>
    </div>
  );
}
