PRAGMA foreign_keys = ON;

-- Part de total_cents que són despeses de gestió i no ingrés de l'activitat.
-- Es guarda a banda perquè el panell de vendes pugui ensenyar el que rebeu de
-- veritat, i no el que ha passat per la passarel·la.
--
-- total_cents segueix sent el que es cobra i el que el webhook compara amb
-- l'import de Stripe. Les comandes anteriors a aquesta columna tenien zero
-- despeses, que és exactament el que diu el valor per defecte.
ALTER TABLE "order" ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0
  CHECK (fee_cents >= 0);
