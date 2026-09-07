# Requisits abans de posar XIVARRI en producció

Aquest document recull la informació, els comptes i les decisions que l'equip d'estudiants ha de proporcionar abans de començar a vendre.

> Regla de propietat: Stripe, el compte bancari, Cloudflare, el domini i Google han d'estar a nom dels estudiants o de la seva entitat. El desenvolupador només ha de rebre una invitació amb els permisos necessaris. No s'han de compartir contrasenyes de comptes personals, codis 2FA ni claus bancàries.
>
> L'única excepció és la contrasenya d'administració del web (secció 3), que per definició és compartida entre l'equip organitzador. No dona accés ni a Stripe, ni al banc, ni a Cloudflare.

## 1. Responsable del projecte i dels cobraments

> **Decidit: compte personal.** Una estudiant és la titular del compte de Stripe
> i la venedora legal de tota la facturació. No es fa a través d'una associació
> d'estudiants — aquesta via es va valorar i es va descartar.
>
> **Què vol dir això, en clar.** Tots els diners que passin per la web són
> ingressos personals d'aquella persona, a efectes fiscals i de responsabilitat.
> És ella qui respon davant d'una disputa, d'una devolució massiva o d'un saldo
> negatiu a Stripe, amb el seu patrimoni. No és una casella més d'aquesta
> llista: és el compromís més gran de tot el projecte, i qui l'assumeixi ho ha
> d'entendre abans de signar res a Stripe. La consulta fiscal d'aquesta secció
> no és opcional.
>
> El codi no ha de saber mai *quina* estudiant és. El compte de Stripe es
> configura fora del repositori (panell + secrets) i cap fitxer del projecte pot
> donar per fet un nom concret.

- [ ] Nom i cognoms de la persona responsable:
- [ ] Correu electrònic permanent:
- [ ] Telèfon:
- [ ] DNI/NIE i domicili fiscal, introduïts directament pel titular a Stripe:
- [ ] IBAN del compte que rebrà els pagaments:
- [ ] Confirmació que el titular accepta gestionar cobraments, devolucions, disputes i possibles saldos negatius:
- [ ] Persona substituta si el titular deixa el projecte:
- [ ] Consulta fiscal/legal feta sobre com s'han de declarar els ingressos:

Stripe pot demanar documentació d'identitat, domicili, activitat i compte bancari abans d'activar els cobraments reals. El titular ha de completar-ho personalment. Referències: [activació del compte de Stripe](https://docs.stripe.com/get-started/account?locale=en-GB) i [documents de verificació a Espanya](https://docs.stripe.com/acceptable-verification-documents?country=ES&document-type=address).

## 2. Stripe

- [ ] Compte creat pel titular amb un correu permanent.
- [ ] Compte completament verificat i habilitat per a pagaments live.
- [ ] Compte bancari connectat i verificat.
- [ ] Nom que apareixerà a l'extracte bancari del comprador.
- [ ] Correu i telèfon d'atenció al comprador.
- [ ] Targetes activades.
- [ ] Bizum activat i disponible per al compte.
- [ ] Rebuts de Stripe configurats.
- [ ] Política i procediment de devolucions acordats.
- [ ] Tots els membres de Stripe amb 2FA.
- [ ] Desenvolupador convidat amb el rol mínim necessari.
- [ ] Autorització per fer una compra live de baix import i retornar-la abans del llançament.

Secrets que s'introduiran a Cloudflare, sense guardar-los a Git:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Referències: [equip i rols de Stripe](https://docs.stripe.com/get-started/account/orgs/team), [seguretat](https://docs.stripe.com/security) i [Bizum](https://docs.stripe.com/payments/bizum).

## 3. Cloudflare, domini i administradors

- [ ] Compte de Cloudflare creat i propietat d'un estudiant responsable.
- [ ] Mètode de pagament i pressupost mensual màxim acordats.
- [ ] Domini definit:
- [ ] Titular del domini:
- [ ] Correu de renovació i recuperació del domini:
- [ ] Desenvolupador convidat a Cloudflare amb permisos de Workers, D1, R2, domini i Access.
- [ ] Contrasenya d'administració acordada i comunicada en persona, mai per WhatsApp:
- [ ] Persones que la coneixen:
- [ ] Persona responsable de canviar-la quan algú abandoni l'equip:

L'accés a `/admin` és una contrasenya compartida, guardada com a secret
`ADMIN_PASSWORD` a Cloudflare. En canviar-la, totes les sessions obertes cauen
automàticament. Com que és compartida, no es pot revocar per persona: l'única
manera de treure l'accés a algú és canviar-la per a tothom.

Deu intents fallits des de la mateixa adreça IP bloquegen l'entrada durant un
quart d'hora. És un terra, no una paret — qui vulgui insistir canvia d'IP — així
que una regla de *rate limiting* de Cloudflare sobre `/entrar`, que és gratuïta
i es configura al panell, continua sent recomanable.

### Comprovacions d'exposició abans d'obrir vendes

- [ ] `workers_dev: false` al `wrangler.jsonc`, perquè el web no quedi també
      publicat a `xivarri.<subdomini>.workers.dev` sense cap protecció.
- [ ] Des d'una finestra d'incògnit, `/admin` mostra la pantalla de contrasenya
      i **cap** dada d'activitats ni de compradors.
- [ ] `/admin/sales/<slug>/export` respon 401 sense sessió.
- [ ] Cap URL de vista prèvia del desplegament és pública.
- [ ] Opcional i recomanat: aplicació de Cloudflare Access sobre `/admin*` amb
      llista de correus, com a segona barrera per si la contrasenya es filtra.

Recursos que s'han de crear dins del seu compte:

- Worker de producció.
- Base de dades D1.
- Bucket R2 per a cartells i productes.
- DNS i domini HTTPS.
- Cloudflare Access per protegir `/admin`.
- Secrets de producció.
- Sistema d'exportació o còpies de seguretat de les comandes.

Cloudflare permet convidar membres amb rols específics; no cal compartir el compte principal. Referències: [rols de Cloudflare](https://developers.cloudflare.com/fundamentals/manage-members/roles/) i [recuperació temporal de D1](https://developers.cloudflare.com/d1/reference/time-travel/).

## 4. Google Sheets i correu de confirmació

> **Decidit: un sol Google Apps Script fa les dues coses.** Quan el webhook de
> Stripe confirma una comanda pagada, crida el script una vegada; el script
> afegeix la fila al full **i** envia el correu amb el codi al comprador. No es
> fa servir cap proveïdor de correu extern.
>
> **Límit que heu de conèixer.** `MailApp` en un compte de Google normal permet
> unes **100 adreces al dia** (1.500 si fos Google Workspace). I com que el
> correu surt d'una adreça `@gmail.com` i no d'un domini verificat, una part
> anirà a spam. Per tant el correu és una **còpia de seguretat**: el canal que
> ha de funcionar sempre és la pantalla amb el codi just després de pagar.
>
> - [ ] Comprovat quants correus/dia permet el compte que fareu servir:
> - [ ] Provat que el correu arriba a Gmail, a Outlook i a iCloud sense anar a spam:
> - [ ] Text del correu acordat (ha de portar el codi en gran i l'enllaç a l'entrada):
> - [ ] Què es fa si es passa el límit diari enmig d'una venda:



- [ ] Compte de Google propietari del document:
- [ ] Correu de recuperació configurat:
- [ ] Nom del full:
- [ ] Persones que hi podran accedir:
- [ ] Una fila per comanda, article o participant:
- [ ] Columnes que necessita l'equip:
- [ ] Temps de conservació de les dades:
- [ ] Qui pot veure DNI, al·lèrgies o altres dades sensibles:
- [ ] Qui revisarà errors de sincronització:

Configuració recomanada:

- D1 és la font oficial de comandes, estoc i pagaments.
- Google Sheets és una còpia operativa, no la base de dades de la botiga.
- Les files s'envien només després de confirmar el pagament mitjançant el webhook de Stripe.
- Cada fila conté `order_id` per evitar duplicats.
- El document és privat i només es comparteix amb els organitzadors.
- El Google Apps Script i el desplegament els crea o autoritza el propietari del compte.

Secrets necessaris a Cloudflare:

- `SHEETS_RELAY_URL`
- `SHEETS_RELAY_SECRET`
- `ADMIN_PASSWORD` (secció 3)

Referència: [transferir la propietat d'un Google Sheet](https://support.google.com/docs/answer/2494892?hl=en-GB).

## 5. Catàleg i funcionament de les vendes

Per a cada activitat, viatge o producte:

- [ ] Tipus: esdeveniment, viatge o marxandatge.
- [ ] Títol en català, castellà i anglès.
- [ ] Descripció en els tres idiomes.
- [ ] Cartell o fotografia amb permís d'ús.
- [ ] Preu final en euros.
- [ ] Estoc o aforament.
- [ ] Data d'inici i final de venda.
- [ ] Data, hora i ubicació, si correspon.
- [ ] Variants: talla, entrada, bus, menú, etc.
- [ ] Quantitat màxima per comprador.
- [ ] Camps obligatoris de cada participant.
- [ ] Instruccions de recollida o accés.
- [ ] Política específica de cancel·lació i devolució.
- [ ] Persona responsable de l'activitat.

Decisions generals:

- [ ] La mercaderia no genera codi d'accés, només un registre de recollida.
- [ ] Es confirma qui pot fer devolucions al panell de Stripe.

**Ja resolt al codi:**

- **Codis d'entrada, no QR.** Cada comanda genera un codi curt per línia, que
  arriba per correu i es mostra a `/t/{codi}`. El QR continua existint a la
  pàgina de l'entrada per a qui el vulgui, però el control de porta funciona
  escrivint el codi. Es va decidir així perquè el codi funciona encara que
  l'enllaç no s'obri.
- **Estoc després d'una devolució: torna a la venda.** Quan Stripe notifica un
  reemborsament o una disputa, la comanda passa a `refunded` i les places
  tornen a l'estoc automàticament. Abans no passava, i cada devolució deixava
  una plaça morta per sempre.

- **Límit màxim d'unitats per compra.** Cada activitat té un camp *Màxim per
  compra* al formulari d'administració. Deixar-lo buit vol dir sense límit. El
  límit es comprova al servidor, no només al formulari.

## 6. Textos legals i protecció de dades

- [ ] Identitat i contacte del responsable de les vendes.
- [ ] Identitat i contacte del responsable del tractament de dades.
- [ ] Avís legal.
- [ ] Política de privacitat.
- [ ] Condicions de compra.
- [ ] Política de devolucions i cancel·lacions.
- [ ] Política de cookies.
- [ ] Terminis de conservació de comandes i dades de participants.
- [ ] Procediment per exercir drets d'accés, rectificació o supressió.
- [ ] Revisió específica de la necessitat de recollir DNI.
- [ ] Revisió específica d'al·lèrgies o dades de salut, amb base jurídica i accés restringit.
- [ ] Confirmació de quines dades poden aparèixer a Google Sheets.
- [ ] Casella d'acceptació de les condicions i la privacitat al moment de pagar,
      amb enllaç als textos i registre de qui l'ha acceptada. **Encara no
      existeix al codi.**
- [ ] Dret de desistiment revisat **per separat per a cada tipus de producte**.
      Les entrades a un esdeveniment amb data concreta i el marxandatge no es
      tracten igual, així que una sola política de devolucions per als tres
      tipus probablement no serveix. Aquesta distinció l'ha de confirmar qui us
      assessori; aquí només queda anotada perquè no es passi per alt.

No s'han de demanar DNI, al·lèrgies ni altres dades sensibles si no són necessàries. Aquesta secció s'hauria de validar amb una persona experta en fiscalitat i protecció de dades abans del llançament. Referència: [guia de compra segura de l'AEPD](https://www.aepd.es/guias/guia-compra-segura-digital-web.pdf).

## 7. Operació diària

- [ ] Persona que publicarà productes i canviarà estoc.
- [ ] Persona que comprovarà els pagaments i webhooks de Stripe.
- [ ] Persona que gestionarà devolucions i disputes.
- [ ] Persona que farà el control de porta.
- [ ] Persona que marcarà les recollides de marxandatge.
- [ ] Persona que atendrà els compradors.
- [ ] Procediment si el pagament existeix però la comanda no apareix com a pagada.
- [ ] Procediment si Google Sheets no rep una comanda.
- [ ] Procediment si un comprador **perd el seu codi**. Serà la incidència més
      freqüent. La pantalla de Porta el cerca pel nom o el correu i mostra el
      codi en gran per llegir-l'hi. Encara no hi ha reenviament automàtic per
      correu: això arribarà amb el relay d'Apps Script.
- [ ] Exportació periòdica de vendes acordada.

**Les devolucions es fan al panell de Stripe, mai al web.** L'administradora
reemborsa des de Stripe; el webhook rep l'avís, marca la comanda com a
retornada, invalida el codi i torna les places a l'estoc. No hi ha cap botó de
devolució a l'administració i no n'hi ha d'haver: dos llocs per fer la mateixa
cosa acaben en dos números diferents.

## 8. Prova final obligatòria

Abans d'obrir vendes s'ha de completar aquest recorregut amb una compra real de baix import:

```text
Compra -> reserva d'estoc -> Stripe -> webhook signat -> comanda pagada a D1
-> codi a la pantalla i al correu -> fila a Google Sheets -> visualització a
l'admin -> devolució des de Stripe -> codi invalidat i plaça retornada
```

- [ ] El comprador veu el seu codi a la pantalla immediatament.
- [ ] El correu amb el codi arriba, i no a la carpeta de spam.
- [ ] L'estoc baixa exactament una vegada.
- [ ] La venda apareix a l'administració.
- [ ] Google Sheets rep una sola fila per unitat definida, sense duplicats en
      cas de reintent de Stripe.
- [ ] **Dues entrades de la mateixa modalitat en una sola compra funcionen.**
      Aquest era l'error més greu que hi havia; ha de quedar provat.
- [ ] Una entrada retornada no es pot validar, i la plaça torna a estar en venda.
- [ ] Un codi no es pot validar dues vegades.
- [ ] Una finestra de venda programada s'obre a l'hora de Girona, no dues hores
      més tard.
- [ ] L'administració demana contrasenya i no filtra cap dada sense sessió.
