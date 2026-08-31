/** App-generated ids (D1 has no serial/uuid type). Workers runtime provides Web Crypto. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read off a screenshot

/** Short, unguessable ticket code, e.g. K7M2X9 (CLAUDE.md §4). */
export function newTicketCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => TICKET_ALPHABET[b % TICKET_ALPHABET.length]).join("");
}
