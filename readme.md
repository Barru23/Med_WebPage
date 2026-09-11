# XIVARRI — Plataforma d'activitats i entrades

Aplicació web per publicar activitats, vendre entrades o marxandatge, gestionar aforaments i validar accessos. Funciona sobre Cloudflare Workers, D1 i R2, amb Stripe Checkout per als pagaments i Google Apps Script com a relé cap a Google Sheets i el correu.

> Estat actual: el codi incorpora l'enduriment previst per a producció i té lint, tipus, proves, build i smoke E2E en verd. La infraestructura externa, el relé, Stripe live, el webhook i els dos manteniments diaris estan configurats i provats. No hi ha cap activitat publicada; una activitat nova començarà a acceptar pagaments reals tan bon punt es publiqui si `CHECKOUT_ENABLED=true`.

## Què hi ha implementat

### Web pública

- Rutes en català, castellà i anglès (`/ca`, `/es` i `/en`) i persistència de l'idioma.
- Portada, departaments, activitats en venda, fitxes d'activitat i fotografies de departament.
- Cartell, galeria, guia de talles, variants, disponibilitat i camps personalitzats.
- Opcions dels camps i missatges de checkout traduïts per idioma.
- Pàgines de comanda i entrada amb estats de pendent, pagada, cancel·lada, reemborsada i disputada.
- Actualització automàtica temporal de la pàgina de comanda en tornar de Stripe.
- Metadades socials per activitat, `sitemap.xml`, `robots.txt` i pàgines d'error.
- Enllaç per saltar al contingut, missatges `aria-live`, focus visible i respecte per `prefers-reduced-motion`.

### Compra, aforament i pagament

- Compra sense compte d'usuari amb preus, límits, variants i respostes validats al servidor.
- Tallafoc global amb `CHECKOUT_ENABLED` i bloqueig automàtic fora de local si falta el nom o el correu públic de l'organització.
- Una entrada i un codi QR independent per cada plaça d'un esdeveniment o viatge.
- Reserva atòmica d'estoc per a compres gratuïtes i de pagament.
- Sessions Stripe de 30 minuts i reserva local de 45 minuts.
- Inventari derivat de comandes pagades i reserves vigents, sense dependre d'un comptador mutable.
- Stripe Checkout amb targeta i Bizum.
- Comissió de servei visible i prova immutable de la versió de condicions acceptada.
- Consentiment específic quan es recullen dades classificades com a identitat o salut.
- Webhooks signats, idempotents i reintentables amb estats `received`, `processing`, `processed` i `failed`.
- Validació d'import, moneda, comanda i revisió de catàleg abans de confirmar el pagament.
- Reemborsaments parcials amb import acumulat i reemborsaments totals amb alliberament d'estoc.
- Disputes que bloquegen l'entrada però retenen la plaça fins a la resolució.

### Edicions i dades històriques

- Edicions independents dins d'una mateixa activitat, cadascuna amb dates, publicació, límit i inventari propis.
- Creació d'una nova edició sense barrejar vendes ni aforament amb l'anterior.
- Snapshots immutables de variant, pregunta, tipus, classificació i resposta a cada línia de comanda.
- Històrics i exportacions estables encara que després s'editin o s'eliminin camps del catàleg.
- Invalidació de sessions pendents quan un canvi de catàleg, publicació, estoc o límit les fa insegures.
- L'estoc nou no es pot definir per sota de les places ja venudes o reservades.

### Administració

- Contrasenya compartida amb limitació atòmica d'intents per IP.
- Cookie de 12 hores signada amb `ADMIN_SESSION_SECRET`, independent de `ADMIN_PASSWORD`.
- Protecció al proxy, layout, pàgines, consultes, exportacions i Server Actions.
- Alta, edició, duplicació, publicació, arxiu i eliminació condicionada d'activitats.
- Creació i canvi d'edicions des de l'activitat.
- Gestió de departaments amb reordenació accessible, fotografia i eliminació només si són buits.
- Confirmacions per a accions destructives i neteja dels fitxers R2 substituïts o eliminats.
- Resum de vendes per edició, ingressos nets de reemborsaments, estoc i exportació Excel.
- Exportació pagada per defecte o exportació completa explícita, amb disputa i versió de condicions.
- Pantalla `/admin/operations` per a comandes pendents, webhooks fallits i problemes de relé.
- Reconciliació d'una comanda pendent directament contra la sessió Stripe.

### Porta i recollida

- Escàner QR amb lectura limitada aproximadament a 8 fotogrames per segon i imatge reduïda.
- Entrada manual i cerca de participants.
- Check-in atòmic: dos escanejos concurrents només poden registrar una entrada.
- Rebuig d'entrades cancel·lades, reemborsades o amb disputa oberta.
- Recollida de marxandatge idempotent i acció separada, confirmada, per desfer-la.

### Google Sheets i correu

- Apps Script protegit amb secret i contracte de payload versió 2.
- Una pestanya per activitat i edició i una fila per entrada/línia.
- Respostes construïdes a partir dels snapshots històrics.
- Columnes dinàmiques i protecció contra injecció de fórmules.
- Estat, intents i error separats per al canal de full i el canal de correu.
- Registre ocult `_relay_log` per evitar correus duplicats en un reintent.
- Reintent d'un canal fallit sense duplicar el canal que ja s'ha completat.
- Assumpte, cos i enllaços del correu localitzats en CA, ES i EN.

### Fitxers, privacitat i manteniment

- Pujades limitades a JPEG, PNG i WebP reals, comprovades per signatura binària.
- Límit de 2 MB per fitxer i 10 MB per formulari d'activitat.
- Noms R2 aleatoris, extensió canònica i metadades validades.
- Descàrrega segura dels formats antics desconeguts i capçaleres `nosniff`, anti-frame i de permisos.
- Camps classificats com `standard`, `identity` o `health`.
- Cap edició es pot publicar sense data final, necessària per calcular la retenció.
- Endpoint protegit `/api/maintenance` i Cron Trigger diari integrat per a neteja, retenció i recuperació de processos encallats.
- Retenció predeterminada a D1 i Sheets: dades sensibles fins a 24 hores després de l'edició i dades normals fins a 12 mesos.
- Anonimització del comprador als 12 mesos i eliminació d'objectes R2 orfes després de 24 hores.

## Arquitectura

```text
Navegador
   │
   ▼
Next.js 16 / React 19 / OpenNext
   │
   ├── Cloudflare D1 ── catàleg, edicions, comandes, reserves i entrades
   ├── Cloudflare R2 ── cartells, fotografies, galeries i guies de talles
   ├── Stripe Checkout ── pagaments, reemborsaments, disputes i webhooks
   └── Apps Script ── Google Sheets + correu de confirmació
```

## Tecnologies

- Next.js 16.3 i React 19
- TypeScript i Tailwind CSS 4
- OpenNext per a Cloudflare Workers
- Cloudflare D1 i R2
- Stripe Checkout
- Google Apps Script
- ExcelJS, `qrcode` i `jsqr`
- ESLint 9 i Playwright

Cal Node.js **20.9 o superior**. La integració contínua utilitza Node.js 22.

## Rutes principals

| Ruta | Funció |
| --- | --- |
| `/[locale]` | Portada pública |
| `/[locale]/d/[slug]` | Activitats d'un departament |
| `/[locale]/a/[slug]` | Fitxa i compra d'una activitat |
| `/[locale]/o/[id]` | Estat i entrades d'una comanda |
| `/[locale]/t/[code]` | Consulta d'una entrada |
| `/[locale]/legal/*` | Avís legal, privacitat i condicions |
| `/admin` | Resum administratiu |
| `/admin/activities` | Catàleg, edicions i activitats |
| `/admin/sales/[slug]` | Vendes i exportacions per edició |
| `/admin/door` | Control d'accés |
| `/admin/pickup` | Recollida de marxandatge |
| `/admin/operations` | Incidències i reconciliació |
| `/api/webhooks/stripe` | Webhook de Stripe |
| `/api/maintenance` | Neteja diària protegida |
| `/media/[key]` | Fitxers de R2 |

## Model de dades i migracions

Les migracions són a `migrations/` i arriben fins a `0013_privacy_retention.sql`:

1. `0001`: esquema inicial.
2. `0002`: reserves i enduriment de comerç.
3. `0003`: mitjans i arxiu.
4. `0004`: funcions operatives.
5. `0005`: sincronització amb el relé.
6. `0006`: seguretat de catàleg.
7. `0007`: comissió de servei.
8. `0008`: consentiment de condicions.
9. `0009`: cicle de vida de pagaments, reemborsaments i disputes.
10. `0010`: edicions d'activitat i inventari separat.
11. `0011`: snapshots immutables de respostes.
12. `0012`: lliurament independent a full i correu.
13. `0013`: classificació i retenció de dades.

## Configuració local

1. Instal·la dependències:

   ```bash
   npm install
   ```

2. Copia `.dev.vars.example` a `.dev.vars` i completa almenys:

   ```dotenv
   ADMIN_PASSWORD=
   ADMIN_SESSION_SECRET=
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   SHEETS_RELAY_URL=
   SHEETS_RELAY_SECRET=
   PUBLIC_BASE_URL=http://localhost:3000
   CHECKOUT_ENABLED=true
   TERMS_VERSION=2026-09-10
   MAINTENANCE_SECRET=
   LEGAL_CONTROLLER_NAME=
   LEGAL_CONTACT_EMAIL=
   ```

3. Aplica migracions i, opcionalment, dades de demostració:

   ```bash
   npm run db:migrate:local
   npm run db:seed:local
   ```

4. Inicia el servidor:

   ```bash
   npm run dev
   ```

`ADMIN_SESSION_SECRET` ha de tenir almenys 32 caràcters. `seed.sql` és només per a desenvolupament i no s'ha d'executar contra producció.

## Scripts

| Ordre | Descripció |
| --- | --- |
| `npm run dev` | Servidor de desenvolupament |
| `npm run lint` | ESLint sobre el projecte |
| `npm run typecheck` | TypeScript sense emetre fitxers |
| `npm test` | Proves unitàries i d'integració amb SQLite |
| `npm run test:e2e` | Smoke tests de navegador amb Playwright |
| `npm run build` | Build de producció de Next.js |
| `npm run preview` | Build i previsualització OpenNext |
| `npm run deploy` | Build i desplegament a Cloudflare |
| `npm run db:migrate:local` | Migracions D1 locals |
| `npm run db:migrate` | Migracions D1 remotes |
| `npm run db:seed:local` | Dades de mostra locals |
| `npm run cf-typegen` | Regenera tipus de Cloudflare |

## Qualitat verificada

Validació local del 10 de setembre de 2026:

- `npm run lint`: correcte.
- `npm run typecheck`: correcte.
- `npm test`: **56/56 proves superades**.
- `npm run build`: correcte.
- `npx opennextjs-cloudflare build`: bundle del Worker generat correctament.
- `npm run test:e2e`: **4/4 proves superades** en escriptori i mòbil amb Chromium.
- round-trip d'ExcelJS en memòria: correcte.
- migracions D1 locals `0001`–`0013`: aplicades correctament.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilitats**.

Validació de producció de l'11 de setembre de 2026:

- compra live de `1,30 €` amb Google Pay, retorn i QR correctes;
- webhook de pagament processat al primer intent;
- fila de Google Sheets i correu enviats sense duplicats;
- reemborsament total rebut per webhook, entrada invalidada i estoc alliberat;
- endpoint de manteniment autenticat executat correctament;
- trigger diari d'Apps Script autoritzat i Cron Trigger de Cloudflare `17 3 * * *` desplegat.

Les proves cobreixen comissions, dates i DST, agregació, reserves concurrents, canvis de pagament, reemborsaments, intents de login, check-in doble, disputes, snapshots, edicions i idempotència del relé. GitHub Actions executa lint, tipus, proves, build, auditoria i E2E amb Chromium en cada push i pull request.

## Regles de negoci

- L'organització absorbeix possibles diferències de cost de targetes premium o internacionals; la comissió mostrada al comprador continua sent simple.
- Una plaça pagada ocupa inventari; una disputa oberta la conserva però bloqueja l'accés.
- Una disputa perduda o un reemborsament total alliberen inventari.
- Les activitats recurrents reutilitzen l'activitat però separen edició, dates, inventari i vendes.
- Cada plaça d'esdeveniment o viatge té QR propi; el marxandatge conserva una línia amb quantitat.
- Els snapshots de compra són la font de veritat dels històrics i del relé.
- L'administració manté una credencial compartida, amb secret de sessió independent i Cloudflare Access recomanat com a segona capa.

## Abans d'obrir vendes reals

El codi resol els bloquejadors tècnics identificats, però queden passos externs que el repositori no pot decidir ni executar sol:

- completar i revisar jurídicament la identitat, privacitat, base legal i condicions;
- configurar secrets forts i el domini canònic a Cloudflare;
- publicar i provar la nova versió d'Apps Script;
- configurar tots els esdeveniments del webhook de Stripe;
- comprovar el Cron diari integrat de `/api/maintenance` i autoritzar el trigger diari d'Apps Script;
- completar una prova de preproducció amb pagament, correu, QR, reemborsament i disputa;
- acordar responsables, monitoratge i procediment d'incidències.

La seqüència exacta, el rollback i la checklist són a [docs/production-runbook.md](docs/production-runbook.md). Fins que s'hagi completat, mantén `CHECKOUT_ENABLED=false`.

## Estat del repositori

El projecte no declara llicència. Les credencials locals, els artefactes de build, les dades personals i els fitxers de resultats s'han de mantenir fora de Git.
