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

A [sheets.google.com](https://sheets.google.com), full nou. Anomena'l
**XIVARRI — Comandes**. No cal preparar-hi res: el script crea la pestanya i
les capçaleres sol la primera vegada.

### 2. Obre l'editor de scripts

Al mateix full: menú **Extensions → Apps Script**.

### 3. Enganxa el codi

Esborra el que hi hagi i enganxa-hi tot el contingut de `Codi.gs`.

### 4. Posa-hi un secret

A dalt de tot del codi hi ha:

```js
var SECRET = 'ENGANXA_AQUI_EL_SECRET';
```

Substitueix-ho per una cadena llarga i aleatòria. Serveix perquè ningú que
endevini l'adreça del script hi pugui escriure files falses. Guarda-te-la:
l'hauràs de posar també a Cloudflare al pas 7.

Desa amb el disquet (o `Ctrl+S`).

### 5. Prova que funciona abans de connectar res

A l'editor, tria la funció **`provaLocal`** al desplegable de dalt i clica
**Executar**.

La primera vegada et demanarà permisos: accepta'ls. Google t'avisarà que
l'aplicació no està verificada — és normal, l'has escrit tu. Clica
**Configuració avançada → Vés a (nom del projecte)**.

Han de passar dues coses:

- apareix una pestanya **Comandes** al full, amb una fila de prova
- t'arriba un correu amb el codi `PROVA1`

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
> del pas 4. El script no retorna mai cap dada del full — només `{"ok":true}` —
> així que ni endevinant l'adreça se'n pot treure res.

Copia l'**URL de l'aplicació web**. Acaba amb `/exec`.

### 7. Digue-li al web on és

Dues comandes al terminal, dins de la carpeta del projecte. Cadascuna et
demanarà el valor pel teclat:

```powershell
npx wrangler secret put SHEETS_RELAY_URL      # l'URL acabada en /exec
npx wrangler secret put SHEETS_RELAY_SECRET   # el secret del pas 4
```

I per a desenvolupament local, les mateixes dues línies a `.dev.vars`.

### 8. Comprova-ho d'extrem a extrem

Fes una compra de prova amb la targeta `4242 4242 4242 4242`. Han de passar
tres coses:

- una fila nova al full per cada entrada
- el correu amb els codis
- a **Vendes**, la columna *Full / correu* amb un ✓

---

## Coses que has de saber

**Límit de correus.** `MailApp` en un compte de Google normal permet unes **100
adreces al dia**. Una compra de tres entrades compta com **una** adreça, no
tres. Si una nit es passa el límit, les files segueixen entrant al full i els
compradors segueixen veient el codi a la pantalla; només es perd el correu, i
es pot reenviar l'endemà amb el botó **Reenviar**.

**Si canvies el codi**, has de tornar a desplegar: **Desplega → Gestiona
desplegaments → llapis → Versió: Nova → Desplega**. Si en comptes d'això crees
un desplegament nou, l'URL canvia i has d'actualitzar el secret.

**Qui hi ha de tenir accés.** Comparteix el full només amb les organitzadores.
Conté noms, correus, telèfons i, als viatges, les respostes de cada
participant — DNI i al·lèrgies incloses. Això és exactament el que
`requisits-produccio.md` §6 diu que s'ha de restringir.

**Duplicats.** El script comprova `order_id` abans d'escriure. Un reintent de
Stripe, o prémer **Reenviar** dues vegades, no pot duplicar cap fila.
