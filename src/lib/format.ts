import type { Locale } from "@/lib/locales";

const intlLocale: Record<Locale, string> = {
  ca: "ca-ES",
  es: "es-ES",
  en: "en-IE",
};

/** Cents → localised EUR string, e.g. 5500 → "55,00 €". */
export function formatPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** ISO-8601 (SQLite datetime) → localised date, or null. */
export function formatDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC.
  const normalized = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
