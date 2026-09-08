/** "12,50" or "12.50" -> 1250 cents. Invalid input is rejected. */
export function eurosToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
