/**
 * Despeses de gestió afegides a cada comanda de pagament.
 *
 * Serveixen per cobrir el que costa processar el cobrament, però **no es
 * presenten mai com un recàrrec per pagar amb targeta**: a Espanya, el Reial
 * decret llei 19/2018 (PSD2) prohibeix cobrar al consumidor per l'ús d'un
 * mitjà de pagament quan és una targeta de consumidor de l'EEE, i Bizum hi
 * entra igual. Per això s'apliquen per igual a tota comanda de pagament,
 * siguin quins siguin els mitjans, i es mostren dins del preu final abans que
 * el comprador es comprometi a res.
 *
 * Una comanda de 0 € no en paga: no passa per la passarel·la.
 */

/** Percentatge que la passarel·la es queda del total cobrat. */
export const FEE_RATE = 0.015;

/** Part fixa, en cèntims, per transacció. */
export const FEE_FIXED_CENTS = 25;

/** Els imports finals s'arrodoneixen amunt a múltiples d'aquests cèntims. */
export const FEE_ROUNDING_CENTS = 5;

/**
 * Despeses a afegir a un subtotal perquè, un cop la passarel·la s'hagi quedat
 * la seva part del TOTAL cobrat, quedi el subtotal íntegre.
 *
 * La part subtil és que la passarel·la cobra sobre el total, despeses
 * incloses. Calcular-les sobre el subtotal — un 1,5% de 50 € més 25 cèntims —
 * sembla correcte i es queda curt: el comprador pagaria 51 €, la comissió real
 * seria d'1,015 € i en quedarien 49,985. Per això es resol a l'inrevés,
 * partint del brut que cal cobrar.
 */
export function serviceFeeCents(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;

  const grossCents = (subtotalCents + FEE_FIXED_CENTS) / (1 - FEE_RATE);
  const feeCents = grossCents - subtotalCents;

  // Amunt sempre: un cèntim de més el paga el comprador, un de menys el paguen
  // els organitzadors dues-centes vegades per activitat.
  return Math.ceil(feeCents / FEE_ROUNDING_CENTS) * FEE_ROUNDING_CENTS;
}

/** Subtotal + despeses, que és el que es cobra de veritat. */
export function totalWithFeeCents(subtotalCents: number): number {
  return subtotalCents + serviceFeeCents(subtotalCents);
}
