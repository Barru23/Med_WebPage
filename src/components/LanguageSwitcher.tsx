"use client";

import { usePathname, useRouter } from "next/navigation";
import { locales, localeLabels, type Locale } from "@/lib/locales";

export default function LanguageSwitcher({
  currentLocale,
}: {
  currentLocale: Locale;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next === currentLocale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    const parts = pathname.split("/");
    parts[1] = next; // replace the leading locale segment
    router.push(parts.join("/") || `/${next}`);
  }

  return (
    <nav aria-label="Language" className="flex items-center font-mono text-xs">
      {locales.map((loc, i) => (
        <span key={loc} className="flex items-center">
          {i > 0 && <span className="px-1 text-sand">/</span>}
          <button
            type="button"
            onClick={() => switchTo(loc)}
            aria-current={loc === currentLocale ? "true" : undefined}
            className={
              loc === currentLocale
                ? "text-signal"
                : "text-ink/70 transition-colors hover:text-ink"
            }
          >
            {localeLabels[loc]}
          </button>
        </span>
      ))}
    </nav>
  );
}
