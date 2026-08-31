// Server-side i18n: message dictionaries + content fallback (CLAUDE.md §5).
// Interface strings are translated once here (messages/*.json). Activity
// CONTENT requires Catalan only; es/en fall back to _ca when empty.

import ca from "../../messages/ca.json";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import type { Locale } from "@/lib/locales";

export * from "@/lib/locales";

type Messages = typeof ca;
const dict: Record<Locale, Messages> = { ca, es, en };

export function getMessages(locale: Locale): Messages {
  return dict[locale];
}

/** Translator bound to a locale: t("activity.buy"). Returns the key if missing. */
export function getT(locale: Locale) {
  const messages = dict[locale];
  return (key: string): string => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (obj, part) =>
          obj && typeof obj === "object"
            ? (obj as Record<string, unknown>)[part]
            : undefined,
        messages,
      );
    return typeof value === "string" ? value : key;
  };
}

/**
 * Pick a localised content column with Catalan fallback.
 * pick(activity, "title", "es") → activity.title_es || activity.title_ca.
 */
export function pick<T extends object>(
  row: T,
  base: string,
  locale: Locale,
): string {
  const record = row as Record<string, unknown>;
  const localized = record[`${base}_${locale}`];
  if (typeof localized === "string" && localized.trim() !== "") return localized;
  const fallback = record[`${base}_ca`];
  return typeof fallback === "string" ? fallback : "";
}
