import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getT, isLocale } from "@/lib/i18n";
import { listDepartments } from "@/lib/queries";
import { LEGAL_NAV } from "@/lib/legal";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  const departments = await listDepartments();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        locale={locale}
        departments={departments.map((department) => ({
          slug: department.slug,
          name:
            locale === "es"
              ? department.name_es || department.name_ca
              : locale === "en"
                ? department.name_en || department.name_ca
                : department.name_ca,
        }))}
      />
      <main id="main-content" className="flex-1">{children}</main>
      <footer className="border-t border-sand px-5 py-6 font-mono text-[0.7rem] uppercase tracking-widest text-ink/70">
        <p>
          {t("brand")} · {t("tagline")}
        </p>
        {/* Stripe checks that a site selling to the public says who is selling
            and on what terms, so these are not only a legal obligation. */}
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.slug}
              href={`/${locale}/legal/${item.slug}`}
              className="outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-signal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
