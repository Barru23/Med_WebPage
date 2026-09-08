/**
 * The shared Google Sheet the Apps Script relay mirrors paid orders into
 * (CLAUDE.md §7), and the names it gives its tabs.
 *
 * **The sheet is a copy, never the source of truth.** The Excel button next to
 * it is generated fresh from D1 on every press; this can go stale the day the
 * sync breaks. Anything that has to be right — a coach manifest, a size count
 * — comes from the Excel.
 *
 * The address lives in the code rather than in a Cloudflare secret because it
 * is not a credential: the sheet is shared with named organisers, not by link.
 * A secret would buy nothing here and would add one more thing that can be
 * uploaded empty and silently leave a dead button on the Sales screen. If this
 * repository ever stops being private, move it to a secret.
 *
 * This module deliberately imports nothing, so the tests can cross-check the
 * tab name against the real `apps-script/Codi.gs`.
 */
export const LIVE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/REDACTED_SHEET_ID/edit";

/**
 * The tab an activity's orders land on, e.g. "Medifutbol — Tardor 2026".
 *
 * Must stay identical to `nomPestanya` in `apps-script/Codi.gs` — the script
 * creates the tab, this only tells the admin which one to look for, and the two
 * live on opposite sides of a copy-paste boundary. `tests/relay-script.test.ts`
 * runs both and compares.
 */
export function sheetTabName(activity: string, edition?: string | null): string {
  let name = activity || "Sense nom";
  if (edition) name += " — " + edition;
  // Characters Google Sheets refuses in a tab name, and its 100-char limit.
  return name.replace(/[:\/?*[\]]/g, "-").slice(0, 100);
}
