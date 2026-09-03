import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandLockup from "@/components/BrandLockup";
import DepartmentNav, { type DepartmentNavItem } from "@/components/DepartmentNav";
import type { Locale } from "@/lib/locales";

export default function SiteHeader({
  locale,
  departments,
}: {
  locale: Locale;
  departments: DepartmentNavItem[];
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-sand bg-bone/95 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-2">
        <Link href={`/${locale}`} className="outline-none focus-visible:ring-2 focus-visible:ring-signal">
          <BrandLockup compact />
        </Link>
        <div className="flex items-center gap-3">
          <a
            href="https://www.instagram.com/xivarriudg/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram de XIVARRI (s'obre en una pestanya nova)"
            className="rounded-sm p-1 text-ink/60 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-signal"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <LanguageSwitcher currentLocale={locale} />
        </div>
      </div>
      <DepartmentNav locale={locale} departments={departments} />
    </header>
  );
}
