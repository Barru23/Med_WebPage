import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale } from "@/lib/locales";

export default function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-sand bg-bone/90 px-5 py-3 backdrop-blur-sm">
      <Link
        href={`/${locale}`}
        className="font-display text-2xl leading-none tracking-tight text-ink"
      >
        XIVARRI
      </Link>
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
