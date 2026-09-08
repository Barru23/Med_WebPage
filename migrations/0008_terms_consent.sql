PRAGMA foreign_keys = ON;

-- Quan el comprador va acceptar les condicions i la privacitat, en el moment
-- de comprar. És la prova que requisits-produccio.md §6 demana: no n'hi ha
-- prou d'ensenyar els textos, cal poder dir qui els va acceptar i quan.
--
-- Nul·lable perquè les comandes anteriors a aquesta columna no en tenen. Les
-- noves no es poden crear sense: la comprovació és al servidor, no al
-- formulari, perquè una casella del navegador es pot saltar.
ALTER TABLE "order" ADD COLUMN terms_accepted_at TEXT;
