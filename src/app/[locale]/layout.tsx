import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getT, isLocale } from "@/lib/i18n";
import { listDepartments } from "@/lib/queries";

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
      <main className="flex-1">{children}</main>
      <footer className="border-t border-sand px-5 py-6 font-mono text-[0.7rem] uppercase tracking-widest text-ink/40">
        {t("brand")} · {t("tagline")}
      </footer>
    </div>
  );
}
