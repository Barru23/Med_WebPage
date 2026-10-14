# Relay de comandes: full de Google + correu al comprador

Quan Stripe confirma un pagament, el web fa **una sola crida** a un Google Apps
Script. El script afegeix les files al full **i** envia el correu amb els codis.
No hi ha cap proveïdor de correu extern.

```
Stripe paga  →  webhook del web  →  comanda pagada a D1
                                      ↓  (en segon pla)
                            Apps Script  →  fila al full
                                         →  correu al comprador
```

**La base de dades del web mana sempre.** Si el script està caigut o s'ha
esgotat la quota de Gmail, la comanda segueix pagada i el comprador segueix
tenint el seu codi a la pantalla. El que passa és que la comanda surt marcada
com a **"no enviat"** a la pantalla de Vendes, amb un botó **Reenviar** al
costat. Aquesta és tota la reparació que necessita.

---

## Muntatge, un sol cop

Tot això s'ha de fer amb el compte `promocio14medicinaudg@gmail.com`, mai amb
un compte personal. El dia que la persona que el va crear marxi, el full i els
correus se'n van amb ella.

### 1. Crea el full

A [sheets.google.com](https://sheets.google.com), **un sol full** per a tot.
Anomena'l **XIVARRI — Comandes**. No cal preparar-hi res ni crear cap pestanya:
el script les crea totes soles.

### 2. Obre l'editor de scripts

Al mateix full: menú **Extensions → Apps Script**.

### 3. Enganxa el codi

Esborra el que hi hagi i enganxa-hi tot el contingut de `Codi.gs`.

### 4. Posa-hi un secret

El secret **no** s'escriu dins del codi: `Codi.gs` és públic al repositori, i
qualsevol valor que hi enganxis acabaria copiat de tornada algun dia.

1. Desa el codi amb el disquet (o `Ctrl+S`).
2. A la barra de l'esquerra, obre **Configuració del projecte** (l'engranatge).
3. A baix de tot, a **Propietats de l'script**, prem **Afegeix una propietat**.
4. Propietat: `SHEETS_RELAY_SECRET`. Valor: una cadena llarga i aleatòria
   (32 caràcters o més).
5. **Desa les propietats de l'script**.

Serveix perquè ningú que endevini l'adreça del script hi pugui escriure files
falses ni enviar correus. Guarda-te-la: l'hauràs de posar també a Cloudflare al
pas 7. Sense aquesta propietat, el script ho rebutja tot amb `no autoritzat`.

> **Si ja tenies el relé muntat amb `var SECRET = '...'` al codi:** crea la
> propietat amb aquell mateix valor *abans* d'enganxar el codi nou, o el relé
> deixarà de funcionar fins que la creïs.

### 5. Prova que funciona abans de connectar res

A l'editor, tria la funció **`provaLocal`** al desplegable de dalt i clica
**Executar**.

La primera vegada et demanarà permisos: accepta'ls. Google t'avisarà que
l'aplicació no està verificada — és normal, l'has escrit tu. Clica
**Configuració avançada → Vés a (nom del projecte)**.

Han de passar dues coses:

- apareix una pestanya **Prova — Tardor 2026** amb dues files, i amb **DNI** i
  **Al·lèrgies** com a columnes pròpies
- t'arriba un correu amb els codis `PROVA1` i `PROVA2`

Quan hagis comprovat que va, esborra aquella pestanya de prova.

Si el correu no arriba, mira la carpeta de correu brossa. **Que hi vagi a parar
és esperable**: surt d'una adreça `@gmail.com` i no d'un domini verificat. Per
això el correu és una còpia de seguretat i el canal principal és la pantalla
amb el codi després de pagar.

### 6. Desplega'l com a aplicació web

Botó blau **Desplega → Nou desplegament**.

- Tipus: **Aplicació web** (fes clic a l'engranatge si no hi surt)
- Descripció: `Relay XIVARRI`
- **Executa com a:** *Jo* (`promocio14medicinaudg@gmail.com`)
- **Qui hi té accés:** *Qualsevol*

> "Qualsevol" fa por però és correcte: el web de Cloudflare no té cap compte de
> Google amb què identificar-se. Qui protegeix el punt d'entrada és el secret
> del pas 4, que es comprova abans de fer res més. El script no retorna mai cap
> dada del full — només `{"ok":true}` — així que ni endevinant l'adreça se'n pot
> treure res. Tot i així, tracta l'URL com un secret: si mai es filtra, fes un
> **desplegament nou** (l'URL canvia) i arxiva l'antic.

Copia l'**URL de l'aplicació web**. Acaba amb `/exec`.

### 7. Digue-li al web on és

Tres comandes al terminal, dins de la carpeta del projecte. Cadascuna et
demanarà el valor pel teclat:

```powershell
npx wrangler secret put SHEETS_RELAY_URL      # l'URL acabada en /exec
npx wrangler secret put SHEETS_RELAY_SECRET   # el secret del pas 4
npx wrangler secret put LIVE_SHEET_URL        # l'adreça del full (o només el seu id)
```

`LIVE_SHEET_URL` és el que fa funcionar el botó **Full de Google en directe** de
la pantalla de Vendes. Accepta l'adreça sencera copiada del navegador o només
l'id. Cap d'aquests tres valors va mai a `wrangler.jsonc` ni al codi.

> Si `SHEETS_RELAY_URL` ja existeix com a **variable** (no secret) al panell de
> Cloudflare, esborra-la primer a *Workers → xivarri → Settings → Variables*:
> un secret i una variable no poden tenir el mateix nom.

I per a desenvolupament local, les mateixes tres línies a `.dev.vars`.

### 8. Comprova-ho d'extrem a extrem

Fes una compra de prova amb la targeta `4242 4242 4242 4242`. Han de passar
tres coses:

- una fila nova al full per cada entrada
- el correu amb els codis
- a **Vendes**, la columna *Full / correu* amb un ✓

---

## Com s'organitza el full

**Una pestanya per activitat i edició**, creada sola la primera vegada que algú
compra:

```
Medifutbol — Tardor 2026
Medifutbol — Primavera 2027
Mediportaventura — Tardor 2026
Dessuadora XIVARRI — Tardor 2026
```

L'edició hi surt a posta. Medifutbol i Medipadel es reobren cada temporada
reutilitzant el mateix registre; sense l'edició al nom, el llistat d'octubre
acabaria barrejat amb el de març i tindríeu jugadors de fa un any a la llista
de la setmana que ve.

**Cada pestanya té les seves pròpies columnes.** Les preguntes personalitzades
d'aquella activitat hi surten com a columnes de veritat: la de Mediportaventura
tindrà DNI, al·lèrgies, contacte d'emergència i parada de bus, cadascuna a la
seva, ordenables i filtrables. La de Medifutbol no en tindrà cap, perquè no en
necessita.

Si un dia afegiu una pregunta nova a una activitat que ja ven, apareix una
columna nova al final i les files antigues segueixen quadrant. No s'ha de
tocar res a mà.

**El que NO hi trobareu són columnes de "ha entrat" o "ha recollit".** La fila
s'escriu un sol cop, quan es paga, i aquestes columnes es quedarien congelades
mentint la nit de l'activitat. L'estat real viu a la pantalla de **Porta** i a
l'Excel que es descarrega des de **Vendes**, que sempre estan al dia.

### Quan una activitat s'acaba: amagar, no esborrar

Botó dret sobre el nom de la pestanya → **Amagar full**.

L'arxiu de veritat és el botó **Descarregar Excel** de la pantalla de Vendes,
que es genera fresc de la base de dades cada vegada i que podreu baixar d'una
activitat de fa dos anys. Però al full de Google la gent hi escriu coses a mà
— "aquest va pagar en efectiu", "trucar-li", "al final no ve" — i **això no
existeix enlloc més**. Esborrar la pestanya ho perd per sempre.

Amagar té el mateix efecte visual, costa dos segons i es pot desfer.

## Coses que has de saber

**Límit de correus.** `MailApp` en un compte de Google normal permet unes **100
adreces al dia**. Una compra de tres entrades compta com **una** adreça, no
tres. Si una nit es passa el límit, les files segueixen entrant al full i els
compradors segueixen veient el codi a la pantalla; només es perd el correu, i
es pot reenviar l'endemà amb el botó **Reenviar**.

Per protegir aquesta quota, les inscripcions **gratuïtes** (0 €) envien com a
màxim 40 correus al dia en total i 3 per connexió. Passat el límit, la
inscripció es fa igual i el codi surt a la pantalla; el correu queda pendent a
**Operacions** perquè l'enviïs a mà si cal.

**Si canvies el codi**, has de tornar a desplegar: **Desplega → Gestiona
desplegaments → llapis → Versió: Nova → Desplega**. Si en comptes d'això crees
un desplegament nou, l'URL canvia i has d'actualitzar el secret.

**Qui hi ha de tenir accés.** Comparteix el full només amb les organitzadores.
Conté noms, correus, telèfons i, als viatges, les respostes de cada
participant — DNI i al·lèrgies incloses. A **Comparteix**, l'accés general ha
de ser **Restringit**, mai «Qualsevol amb l'enllaç». La retenció i qui ha de
poder veure aquestes dades són al
[runbook de producció](../docs/production-runbook.md#manteniment-programat).

**Duplicats.** El script comprova `order_id` abans d'escriure. Un reintent de
Stripe, o prémer **Reenviar** dues vegades, no pot duplicar cap fila.
