# Runbook de producció

Aquest document descriu la posada en producció, el manteniment i la resposta a incidències de XIVARRI. Les migracions `0009`–`0014` són additives, però el codi nou pressuposa que totes estan aplicades.

## Responsables

Abans d'obrir vendes, cal assignar una persona per a cada funció:

- desplegament i Cloudflare;
- Stripe, reemborsaments i disputes;
- privacitat i textos legals;
- Google Sheets/correu;
- operativa de porta i recollida.

Cal que almenys dues persones sàpiguen activar el tallafoc de compra i accedir a `/admin/operations`.

## Variables i secrets

Secrets obligatoris del Worker:

```text
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SHEETS_RELAY_URL
SHEETS_RELAY_SECRET
LIVE_SHEET_URL
MAINTENANCE_SECRET
```

`ADMIN_SESSION_SECRET` i `MAINTENANCE_SECRET` han de ser valors aleatoris diferents, de 32 caràcters o més. No s'han de reutilitzar contrasenyes ni secrets de Stripe.

Variables de configuració obligatòries abans d'obrir el checkout:

```text
PUBLIC_BASE_URL=https://domini-public.example
CHECKOUT_ENABLED=false
TERMS_VERSION=AAAA-MM-DD
LEGAL_CONTROLLER_NAME=...
LEGAL_CONTACT_EMAIL=...
```

Es poden carregar els secrets d'un en un amb:

```bash
npx wrangler secret put NOM_DEL_SECRET
```

El checkout es manté tancat fora de `localhost` si falta el nom o el correu públic de l'organització, o si contenen un valor de mostra. `CHECKOUT_ENABLED=false` és el tallafoc operatiu i s'ha de mantenir així durant les migracions i les proves de preproducció.

## Preparació del relé

1. Copia `apps-script/Codi.gs` al projecte d'Apps Script vinculat al full.
2. Defineix el secret del relé a les propietats de l'script amb el mateix valor que `SHEETS_RELAY_SECRET`.
3. Desplega una versió nova de l'aplicació web i copia'n l'URL a `SHEETS_RELAY_URL`.
4. Executa manualment `installDailyMaintenance()` una vegada des de l'editor i autoritza el trigger diari.
5. Fes una comanda de prova. Verifica una sola fila al full, un sol correu i les pestanyes ocultes `_relay_log` i `_relay_meta`.
6. Força temporalment un error de correu en un entorn de prova i comprova que el reintent no duplica la fila del full.

El full i el correu tenen estats independents. Un estat `unknown` no es reintenta automàticament perquè pot correspondre a un enviament antic sense prova d'idempotència; l'administrador demana confirmació abans de repetir-lo.

## Configuració de Stripe

El webhook apunta a:

```text
https://DOMINI/api/webhooks/stripe
```

Esdeveniments requerits:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
charge.dispute.created
charge.dispute.closed
```

Primer s'ha de validar tot amb claus de prova. Les claus live només es carreguen després de completar la llista de sortida. Una discrepància d'import, moneda, revisió de catàleg o comanda deixa l'esdeveniment com a `failed` i retorna error a Stripe perquè sigui reintentable.

## Desplegament segur

### 1. Validacions locals

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

### 2. Punt de recuperació D1

Abans de migrar, desa l'hora UTC i obtén el bookmark remot:

```bash
npx wrangler d1 time-travel info xivarri --timestamp 2026-09-10T12:00:00Z --json
```

Conserva el resultat al registre intern del desplegament. No executis un `restore` preventiu: només s'utilitza en una incidència confirmada.

### 3. Migracions

Amb les vendes tancades:

```bash
npm run db:migrate
```

Comprova que arriben fins a `0014_checkout_abuse_limits.sql`. No executis `seed.sql` a producció.
Les edicions migrades des de l'esquema antic no tenen data final perquè no es pot inferir amb seguretat: revisa-les totes a l'administració i assigna `ends_at`. Una edició sense data final no apareix al web públic ni accepta compres.
La migració classifica de manera conservadora noms comuns com DNI, passaport, al·lèrgies, salut i contacte d'emergència. Revisa manualment la classificació de totes les preguntes abans de publicar-les.

### 4. Codi i smoke test

```bash
npm run deploy
```

Amb `CHECKOUT_ENABLED=false`, comprova:

- portada, departaments, activitat, selector d'idioma, `robots.txt` i `sitemap.xml`;
- redirecció de `/admin/activities` al login sense sessió;
- inici i tancament de sessió d'administració;
- `/admin/operations` sense incidències inesperades;
- pujada d'una imatge JPEG, PNG o WebP vàlida i rebuig d'un fitxer fals;
- exportació Excel d'una edició;
- càmera i entrada manual a Porta sobre una entrada de prova;
- recollida i desfer recollida sobre marxandatge de prova.

### 5. Compra de prova

En mode test de Stripe:

1. activa temporalment el checkout;
2. compra dues places de la mateixa variant;
3. comprova dos codis QR independents;
4. comprova la pàgina de retorn, el full i el correu;
5. escaneja el mateix QR dues vegades: només el primer intent pot registrar l'entrada;
6. prova un reemborsament parcial i un de total;
7. simula una disputa: ha de bloquejar l'entrada sense alliberar la plaça mentre és oberta;
8. comprova les edicions separades i que l'estoc d'una no afecta l'altra.

### 6. Obertura

Quan els textos legals hagin estat revisats i les proves siguin correctes, carrega les claus live, actualitza `TERMS_VERSION` si correspon i posa `CHECKOUT_ENABLED=true`. Supervisa Stripe, `/admin/operations` i el relé durant les primeres comandes.

## Manteniment programat

Hi ha dues tasques diàries complementàries. El Worker principal incorpora un
Cron Trigger a les `03:17 UTC` que fa un `POST` a:

```text
https://DOMINI/api/maintenance
Authorization: Bearer MAINTENANCE_SECRET
```

El handler programat és a `custom-worker.ts` i utilitza el mateix
`MAINTENANCE_SECRET` del Worker. Una resposta correcta és JSON amb `ok: true`;
una resposta d'error fa fallar l'esdeveniment i queda visible a **Cron Events**.

La tasca del Worker:

- elimina intents de login antics;
- recupera leases de webhook encallades i elimina deduplicacions processades de més de 90 dies;
- cancel·la comandes gratuïtes o manuals abandonades sense sessió Stripe;
- allibera les reserves associades a comandes cancel·lades;
- elimina respostes d'identitat o salut 24 hores després del final de l'edició;
- elimina la resta de respostes i anonimitza el comprador 12 mesos després;
- elimina fitxers R2 orfes de més de 24 hores.

El trigger `runRetentionCleanup` d'Apps Script elimina les columnes sensibles dels fulls al cap de 24 hores i la pestanya sencera al cap de 12 mesos. Cap edició es pot publicar sense data final. Cal comprovar periòdicament **Cron Events** i que el trigger d'Apps Script continua actiu; el desplegament crea el Cron de Cloudflare, però no pot autoritzar el trigger del compte de Google.

## Operacions i incidències

### Comanda pendent

Obre `/admin/operations` i prem `Reconciliar`. El sistema consulta la sessió a Stripe:

- si és expirada, cancel·la la comanda i allibera la reserva;
- si és pagada i l'import coincideix, confirma la comanda i activa el relé;
- si l'import o la moneda no coincideixen, s'atura i requereix revisió manual.

No marquis manualment una comanda Stripe com a pagada.

### Webhook fallit

1. Revisa el missatge a `/admin/operations` i els logs del Worker.
2. Corregeix primer la causa: migració, configuració, import o referència desconeguda.
3. Reenvia l'esdeveniment des del Dashboard de Stripe.
4. Confirma que passa a `processed` i que no duplica estoc, full ni correu.

### Relé fallit

Reintenta només el canal fallit des de la pantalla de vendes. Si l'estat és `unknown`, comprova abans el full i la bústia del comprador.

### Disputa

Una disputa oberta conserva la plaça però invalida l'accés. Si es guanya, l'entrada torna a ser vàlida; si es perd, la comanda passa a reemborsada i l'estoc queda disponible.

### Aturada urgent de vendes

1. posa `CHECKOUT_ENABLED=false` i desplega/configura la variable;
2. despublica només les activitats afectades si la incidència és parcial;
3. revisa les sessions pendents a `/admin/operations`;
4. no esborris comandes ni esdeveniments Stripe com a mecanisme de recuperació.

## Rollback

Les migracions noves afegeixen taules i columnes; el rollback normal és:

1. mantenir `CHECKOUT_ENABLED=false`;
2. tornar a desplegar l'última versió compatible;
3. conservar D1 per a diagnòstic;
4. si hi ha corrupció confirmada, restaurar el bookmark guardat:

```bash
npx wrangler d1 time-travel restore xivarri --bookmark BOOKMARK_CONFIRMAT
```

Restaurar D1 descarta els canvis posteriors al punt escollit. Abans de fer-ho, exporta o registra les comandes creades després del bookmark i coordina l'acció amb Stripe; D1 i Stripe no es restauren conjuntament.

## Llista de sortida

- [ ] Identitat, privacitat i condicions revisades per una persona responsable.
- [ ] `PUBLIC_BASE_URL` correspon al domini definitiu.
- [ ] Secrets independents, forts i carregats a Cloudflare.
- [ ] Apps Script v2 publicat, provat sense duplicats i amb trigger diari autoritzat.
- [ ] Webhook Stripe amb tots els esdeveniments requerits.
- [ ] Cron diari de manteniment amb alerta de fallada.
- [ ] Punt de recuperació D1 registrat.
- [ ] Migracions `0001`–`0014` aplicades.
- [ ] CI, build, proves unitàries i E2E en verd.
- [ ] Compra, QR, porta, reemborsament i disputa provats en mode test.
- [ ] Responsables i canal d'incidències acordats.
- [ ] `CHECKOUT_ENABLED=true` només després de completar els punts anteriors.
