// Wall-clock <-> UTC conversion for the one timezone this site lives in.
//
// Admins type dates into <input type="datetime-local">, which yields a bare
// "YYYY-MM-DDTHH:mm" with no zone — it means "20:00 in Girona". SQLite's
// datetime('now') is UTC, and every sale-window comparison uses it, so a value
// stored verbatim opens the sale 1h (winter) or 2h (summer) late. We therefore
// store UTC and convert on the way in and out.
export const SITE_TIMEZONE = "Europe/Madrid";

/** Milliseconds a zone was ahead of UTC at a given instant (DST-aware). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Intl renders midnight as hour "24" in some ICU builds; normalise it.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant.getTime();
}

/**
 * "YYYY-MM-DDTHH:mm" as read on a Girona clock -> "YYYY-MM-DD HH:MM:SS" UTC,
 * the form SQLite compares against datetime('now').
 */
const WALL_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function wallTimeToUtc(value: string): string | null {
  // Date's parser is lenient enough to turn junk into a real instant, so the
  // shape is checked before it ever sees the string.
  if (!WALL_TIME_RE.test(value)) return null;
  const asIfUtc = new Date(`${value.slice(0, 16)}:00Z`);
  if (Number.isNaN(asIfUtc.getTime())) return null;
  // Guess the offset at the naive instant, then re-check with the corrected
  // one so instants near a DST switch land on the right side of it.
  const guess = zoneOffsetMs(asIfUtc, SITE_TIMEZONE);
  let utc = new Date(asIfUtc.getTime() - guess);
  const corrected = zoneOffsetMs(utc, SITE_TIMEZONE);
  if (corrected !== guess) utc = new Date(asIfUtc.getTime() - corrected);
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

/** Stored UTC -> the "YYYY-MM-DDTHH:mm" an admin should see in the input. */
export function utcToWallTime(stored: string | null): string {
  if (!stored) return "";
  const utc = new Date(`${stored.replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(utc.getTime())) return stored.replace(" ", "T").slice(0, 16);
  const local = new Date(utc.getTime() + zoneOffsetMs(utc, SITE_TIMEZONE));
  return local.toISOString().slice(0, 16);
}

/** "now" in the same stored form, for reservation expiry etc. */
export function utcNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace("T", " ");
}
