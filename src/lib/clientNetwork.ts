/**
 * The "who is this" key behind every per-client limit: login attempts and
 * open checkout holds.
 *
 * An IPv4 address is one key. An IPv6 address is NOT: a single home or
 * phone connection is handed a whole /64 — eighteen quintillion addresses —
 * and can pick a fresh one for every request. Counting exact IPv6 addresses
 * would let one person walk straight past any limit, so IPv6 is grouped by
 * its /64 prefix, which is what one subscriber actually controls.
 *
 * Deliberately imports nothing, so tests can run it without the Next or
 * Cloudflare runtime.
 */

/** Eight 16-bit groups, or null when the text is not an IPv6 address. */
function ipv6Groups(text: string): number[] | null {
  let address = text.split("%")[0]; // drop a zone id such as fe80::1%eth0
  const embedded = address.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (embedded) {
    const octets = embedded.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    address =
      address.slice(0, -embedded[0].length) +
      ((octets[0] << 8) | octets[1]).toString(16) +
      ":" +
      ((octets[2] << 8) | octets[3]).toString(16);
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * The rate-limit key for a client address.
 *
 * - IPv4 → the address itself, `203.0.113.7`.
 * - IPv4-mapped IPv6 (`::ffff:203.0.113.7`) → the same IPv4 key, so one
 *   client cannot count twice by switching notation.
 * - IPv6 → its /64 prefix, `2001:db8:0:1::/64`, in one canonical spelling.
 * - Anything unparseable → the trimmed text, so it is still limited as one
 *   client rather than slipping through unlimited.
 */
export function networkKey(ip: string): string {
  const text = ip.trim().toLowerCase();
  const v4 = text.match(IPV4);
  if (v4 && v4.slice(1).every((octet) => Number(octet) <= 255)) {
    return v4.slice(1).map(Number).join(".");
  }

  const groups = ipv6Groups(text);
  if (!groups) return text.slice(0, 64) || "unknown";

  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`;
}
