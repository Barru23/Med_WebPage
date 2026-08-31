// Client-safe locale constants (no message imports, so this can be pulled into
// client components — e.g. the language switcher — without bundling the dicts).

export const locales = ["ca", "es", "en"] as const;
export type Locale = (typeof locales)[number];

// Catalan is the default (CLAUDE.md §5).
export const defaultLocale: Locale = "ca";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// Short labels for the header switcher.
export const localeLabels: Record<Locale, string> = {
  ca: "CA",
  es: "ES",
  en: "EN",
};
