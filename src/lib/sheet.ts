/**
 * The shared Google Sheet the Apps Script relay mirrors paid orders into
 * (CLAUDE.md §7), and the names it gives its tabs.
 *
 * **The sheet is a copy, never the source of truth.** The Excel button next to
 * it is generated fresh from D1 on every press; this can go stale the day the
 * sync breaks. Anything that has to be right — a coach manifest, a size count
 * — comes from the Excel.
 *
 * The address comes from the Cloudflare variable LIVE_SHEET_URL, never from
 * this file: the repository is public and the sheet holds DNIs and allergies.
 * Sharing must still be restricted to named organisers — the id is not a
 * credential, only a pointer — but there is no reason to hand the pointer out.
 *
 * This module deliberately imports nothing, so the tests can cross-check the
 * tab name against the real `apps-script/Codi.gs`.
 */

// Google's spreadsheet ids are long URL-safe tokens. A shorter value is a
// typo or a placeholder, not a sheet.
const SHEET_ID = /^[A-Za-z0-9_-]{20,}$/;
const SHEET_URL = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/;

/**
 * The link the Sales screen opens, built from LIVE_SHEET_URL.
 *
 * Accepts either the bare id or the full address copied from the browser bar
 * (whatever tab or `#gid` it was on), and always answers with the canonical
 * edit URL. Returns null when the value is missing or unrecognisable, so the
 * screen can say so instead of linking somewhere wrong.
 */
export function liveSheetUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const id = SHEET_ID.test(value) ? value : value.match(SHEET_URL)?.[1];
  if (!id || !SHEET_ID.test(id)) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

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
