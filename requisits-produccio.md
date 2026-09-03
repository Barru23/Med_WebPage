# Requisits abans de posar XIVARRI en producció

Aquest document recull la informació, els comptes i les decisions que l'equip d'estudiants ha de proporcionar abans de començar a vendre.

> Regla de propietat: Stripe, el compte bancari, Cloudflare, el domini i Google han d'estar a nom dels estudiants o de la seva entitat. El desenvolupador només ha de rebre una invitació amb els permisos necessaris. No s'han de compartir contrasenyes, codis 2FA ni claus bancàries.

## 1. Responsable del projecte i dels cobraments

- [ ] Nom i cognoms de la persona responsable:
- [ ] Correu electrònic permanent:
- [ ] Telèfon:
- [ ] DNI/NIE i domicili fiscal, introduïts directament pel titular a Stripe:
- [ ] Tipus de titular: particular, autònom, associació o empresa:
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
- [ ] Llista de correus autoritzats per entrar a `/admin`:
- [ ] Persona responsable de retirar accessos quan algú abandoni l'equip:

Recursos que s'han de crear dins del seu compte:

- Worker de producció.
- Base de dades D1.
- Bucket R2 per a cartells i productes.
- DNS i domini HTTPS.
- Cloudflare Access per protegir `/admin`.
- Secrets de producció.
- Sistema d'exportació o còpies de seguretat de les comandes.

Cloudflare permet convidar membres amb rols específics; no cal compartir el compte principal. Referències: [rols de Cloudflare](https://developers.cloudflare.com/fundamentals/manage-members/roles/) i [recuperació temporal de D1](https://developers.cloudflare.com/d1/reference/time-travel/).

## 4. Google Sheets

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

- [ ] Una compra de diverses entrades generarà un QR independent per persona.
- [ ] La mercaderia no generarà un QR d'accés, només un registre de recollida.
- [ ] Es defineix què passa amb l'estoc després d'una devolució.
- [ ] Es defineix un límit màxim d'unitats per compra.

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
- [ ] Exportació periòdica de vendes acordada.

## 8. Prova final obligatòria

Abans d'obrir vendes s'ha de completar aquest recorregut amb una compra real de baix import:

```text
Compra -> reserva d'estoc -> Stripe -> webhook signat -> comanda pagada a D1
-> entrada o recollida -> registre a Google Sheets -> visualització a l'admin
-> devolució de prova -> entrada invalidada
```

- [ ] El comprador rep o pot obrir la seva entrada.
- [ ] L'estoc baixa exactament una vegada.
- [ ] La venda apareix a l'administració.
- [ ] Google Sheets rep una sola fila per unitat definida.
- [ ] Una entrada retornada no es pot validar.
- [ ] Un QR no es pot validar dues vegades.
- [ ] L'administració només és accessible pels correus autoritzats.
