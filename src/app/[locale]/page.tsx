import Link from "next/link";
import { getT, pick, isLocale, type Locale } from "@/lib/i18n";
import { listDepartments, listOnSale } from "@/lib/queries";
import { GreasePencilRing, MarkerNote } from "@/components/marks";
import { notFound } from "next/navigation";

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

  // The first open department gets the single grease-pencil ring.
  const firstOpen = departments.find((d) => d.open_count > 0)?.id;

  return (
    <div className="px-5 pb-16">
      {/* Hero — Bodoni bleeding off the left edge. */}
      <section className="-mx-5 overflow-hidden pt-8 pb-6 pl-5">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-ink/50">
          {t("home.contactSheet")}
        </p>
        <h1 className="mt-1 font-display text-[clamp(3.5rem,22vw,11rem)] leading-[0.82] tracking-tight text-ink">
          XIVARRI
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-widest text-ink/50">
          {t("tagline")}
        </p>
      </section>

      {/* Contact sheet — grid of department frames. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {departments.map((dept, i) => {
          const open = dept.open_count > 0;
          const name = pick(dept, "name", l);
          const frame = String(i + 1).padStart(2, "0");
          return (
            <Link
              key={dept.id}
              href={`/${locale}/d/${dept.slug}`}
              className={`group relative flex aspect-[4/5] flex-col border border-sand bg-bone p-2 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-signal ${
                open ? "hover:shadow-[3px_3px_0_var(--color-sand)]" : "opacity-60"
              }`}
            >
              {/* Frame number, contact-sheet index style. */}
              <span className="font-mono text-[0.65rem] tracking-widest text-ink/40">
                {frame}
              </span>

              {/* Typographic fallback for the (currently missing) photo. */}
              <span className="relative flex flex-1 items-center justify-center px-1 text-center">
                {open && dept.id === firstOpen && <GreasePencilRing />}
                <span className="font-display text-[clamp(1.5rem,7vw,2.75rem)] leading-none tracking-tight text-ink">
                  {name}
                </span>
              </span>

              {/* Caption strip. */}
              <span className="mt-1 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-widest">
                <span className="text-ink/60">{name}</span>
                <span className={open ? "text-signal" : "text-ink/40"}>
                  {open ? `· ${dept.open_count}` : t("home.noOpenActivities")}
                </span>
              </span>
            </Link>
          );
        })}
      </section>

      {/* Thin mono strip — what is on sale right now (CLAUDE.md §8). */}
      <section className="mt-8 border-t border-sand pt-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-signal">
            {t("home.onSaleNow")}
          </h2>
          {onSale.length === 0 ? (
            <p className="font-mono text-xs text-ink/50">
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
