/**
 * Textos legals del web.
 *
 * ⚠️ QUI VEN ÉS EL COL·LECTIU, NO CAP PERSONA CONCRETA. Per decisió de
 * l'organització aquestes pàgines no publiquen cap nom particular, ni DNI, ni
 * adreça, ni telèfon: el correu compartit de la promoció és l'únic canal de
 * contacte. Cap fitxer del projecte ha de donar per fet un nom concret
 * (CLAUDE.md §9).
 *
 * ⚠️ AQUESTS TEXTOS ELS HA DE REVISAR ALGÚ QUE HI ENTENGUI abans del
 * llançament. Són un esborrany honest i complet del que normalment demana una
 * venda a distància, no un dictamen. El punt més delicat és el dret de
 * desistiment, que NO funciona igual per a una entrada amb data fixada que per
 * al marxandatge — vegeu el document de devolucions.
 *
 * Es publiquen només en català, com la resta de contingut (CLAUDE.md §5).
 */

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  intro?: string;
  sections: LegalSection[];
}

/** Ha d'aparèixer al peu de cada document públic. */
export const LEGAL_NAV: Array<{ slug: string; label: string }> = [
  { slug: "avis-legal", label: "Avís legal" },
  { slug: "privacitat", label: "Privacitat" },
  { slug: "condicions", label: "Condicions de compra" },
  { slug: "devolucions", label: "Devolucions" },
  { slug: "cookies", label: "Cookies" },
];

const TITULAR = "els estudiants de la 14a promoció de Medicina de la Universitat de Girona";
const CORREU = "promocio14medicinaudg@gmail.com";

/**
 * Mesos que es conserven les dades d'un participant després de l'activitat.
 *
 * Dotze: cobreix la temporada sencera d'una activitat que es reobre cada any i
 * el termini en què encara pot aparèixer una reclamació o una devolució, sense
 * arrossegar llistats de fa anys. El DNI i les dades de salut no esperen tant
 * — s'esborren en acabar l'activitat — i el registre comptable de les vendes
 * viu a Stripe amb els seus propis terminis.
 *
 * No hi ha cap procés que ho faci sol: és una neteja que algú ha de fer.
 */
const MESOS_CONSERVACIO = "12";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "avis-legal",
    title: "Avís legal",
    intro:
      "Aquest web el gestiona la promoció XIVARRI, la 14a promoció de Medicina de la Universitat de Girona, per organitzar les seves activitats i vendre'n les entrades i el marxandatge.",
    sections: [
      {
        heading: "Qui ven",
        body: [
          `Titular del web i responsables de la venda: ${TITULAR}.`,
          `Contacte: ${CORREU}.`,
          "XIVARRI és el nom amb què es coneix la promoció. No és cap empresa ni una entitat amb personalitat jurídica pròpia, i no té ànim de lucre: les activitats les organitzen els mateixos estudiants i el que es recapta serveix per pagar-les.",
          `Qualsevol qüestió sobre una compra, una activitat o aquestes pàgines es resol escrivint a ${CORREU}, que és el canal de contacte de la promoció.`,
          "Aquest web no està vinculat oficialment a la Universitat de Girona ni la representa.",
        ],
      },
      {
        heading: "Què hi trobareu",
        body: [
          "La venda d'entrades per a activitats, sortides i marxandatge organitzats per la promoció.",
          "Per comprar no cal crear cap compte. Només es demana el nom, el correu i, si escau, les dades que necessita cada activitat.",
        ],
      },
      {
        heading: "Continguts i imatges",
        body: [
          "Els textos, les fotografies i els cartells d'aquest web pertanyen a la promoció o s'hi publiquen amb permís. No es poden reutilitzar amb finalitats comercials sense autorització.",
          "Si creieu que algun contingut vulnera drets vostres, escriviu a " +
            CORREU +
            " i es retirarà mentre es comprova.",
        ],
      },
      {
        heading: "Llei aplicable",
        body: [
          "Aquestes condicions es regeixen per la legislació espanyola.",
          "Per a qualsevol reclamació, escriviu primer a " +
            CORREU +
            ". Si sou consumidor, conserveu els drets que la llei us reconeix, inclosa la possibilitat d'acudir als organismes de consum corresponents.",
        ],
      },
    ],
  },

  {
    slug: "privacitat",
    title: "Política de privacitat",
    intro:
      "Aquesta pàgina explica quines dades es recullen quan compreu, per a què serveixen, qui hi té accés i com podeu esborrar-les.",
    sections: [
      {
        heading: "Qui tracta les vostres dades",
        body: [
          `Responsables del tractament: ${TITULAR}.`,
          `Per a qualsevol qüestió sobre les vostres dades, i per exercir els drets que s'expliquen més avall: ${CORREU}.`,
        ],
      },
      {
        heading: "Quines dades es recullen",
        body: [
          "De tothom qui compra: nom i cognoms, adreça de correu electrònic i, opcionalment, telèfon.",
          "De les activitats que ho necessiten: les respostes a les preguntes que es mostren al formulari de compra. En algunes sortides això inclou el DNI, un contacte d'emergència i, si l'activitat ho requereix, informació sobre al·lèrgies o intoleràncies.",
          "Del pagament: no es guarda cap dada de la vostra targeta. El pagament el processa Stripe i aquest web no hi té accés en cap moment.",
        ],
      },
      {
        heading: "Per a què s'utilitzen",
        body: [
          "Per gestionar la compra, generar el codi d'entrada i controlar l'accés a l'activitat.",
          "Per posar-nos en contacte amb vosaltres si hi ha un canvi o una incidència.",
          "Per organitzar l'activitat: llistes de participants, reserves de transport, comandes de talles.",
          "Les dades d'al·lèrgies o de salut només s'utilitzen per garantir la vostra seguretat durant l'activitat, i només hi accedeixen les persones que l'organitzen.",
          "No s'utilitzen per a publicitat i no es venen ni es cedeixen a tercers amb finalitats comercials.",
        ],
      },
      {
        heading: "Amb quina base legal",
        body: [
          "Per gestionar la compra i lliurar-vos l'entrada: l'execució del contracte que feu en comprar.",
          "Per a les dades de salut, com les al·lèrgies: el vostre consentiment explícit, que doneu en omplir voluntàriament aquell camp. Podeu no informar-ne, tot i que això pot impedir que l'organització en tingui en compte les necessitats.",
          "Per conservar el registre de les vendes: el compliment de les obligacions legals de qui ven.",
        ],
      },
      {
        heading: "Qui més hi té accés",
        body: [
          "Stripe Payments Europe, per processar el pagament.",
          "Cloudflare, on s'allotja el web i la base de dades, dins de la Unió Europea.",
          "Google, on es manté una còpia operativa del llistat de participants i des d'on s'envia el correu de confirmació.",
          "Les persones que organitzen cada activitat, amb l'accés limitat al que necessiten per fer-la.",
          "Ningú més.",
        ],
      },
      {
        heading: "Quant de temps es conserven",
        body: [
          `Les dades dels participants s'esborren ${MESOS_CONSERVACIO} mesos després de l'activitat.`,
          "Les dades de salut i el DNI s'esborren tan aviat com l'activitat ha acabat i ja no fan cap falta.",
          "El registre de les vendes es conserva el temps que exigeixi la normativa fiscal.",
        ],
      },
      {
        heading: "Els vostres drets",
        body: [
          `Podeu demanar accés a les vostres dades, rectificar-les, esborrar-les, limitar-ne l'ús, oposar-vos al tractament o demanar-ne una còpia portable. N'hi ha prou amb un correu a ${CORREU} des de l'adreça amb què vau comprar.`,
          "Si considereu que no s'han respectat els vostres drets, podeu presentar una reclamació davant l'Agència Espanyola de Protecció de Dades (aepd.es).",
        ],
      },
    ],
  },

  {
    slug: "condicions",
    title: "Condicions de compra",
    intro:
      "En comprar accepteu aquestes condicions. Estan escrites perquè s'entenguin: si alguna cosa no queda clara, pregunteu abans de pagar.",
    sections: [
      {
        heading: "Qui ven i què",
        body: [
          `Qui ven són ${TITULAR}, amb les dades de contacte de l'avís legal.`,
          "Es venen entrades per a activitats i sortides organitzades per la promoció, i marxandatge que es recull en mà.",
          "No es fan enviaments postals. El marxandatge es recull als punts i horaris que s'anunciïn.",
        ],
      },
      {
        heading: "Preus",
        body: [
          "Els preus de cada modalitat es mostren en euros i inclouen els impostos aplicables.",
          "A cada comanda s'hi afegeixen unes despeses de gestió que cobreixen el que costa processar el cobrament. Es mostren desglossades al resum, abans de pagar, i són les mateixes tant si pagueu amb targeta com amb Bizum.",
          "El total que veieu al resum abans de prémer el botó de pagar és exactament el que se us cobra. No hi ha cap altre càrrec ni per emissió de l'entrada.",
        ],
      },
      {
        heading: "Com es compra",
        body: [
          "Trieu la modalitat, indiqueu les vostres dades i, si l'activitat ho demana, responeu les preguntes de cada participant.",
          "Es reserva la vostra plaça durant 30 minuts mentre completeu el pagament. Si no el completeu dins d'aquest temps, la plaça torna a estar disponible per a tothom.",
          "Algunes activitats limiten el nombre d'unitats per compra. Si és el cas, es diu al mateix formulari.",
        ],
      },
      {
        heading: "Pagament",
        body: [
          "El pagament es fa amb targeta o amb Bizum, a través de Stripe.",
          "Aquest web no veu ni desa cap dada de la vostra targeta.",
          "La compra no és ferma fins que Stripe confirma el pagament. Fins llavors la plaça continua només reservada.",
        ],
      },
      {
        heading: "La vostra entrada",
        body: [
          "En confirmar-se el pagament rebeu un codi curt. Es mostra a la pantalla immediatament i també s'envia per correu.",
          "El codi que veieu a la pantalla és el canal principal: feu-ne una captura. El correu és una còpia de seguretat i pot arribar a la carpeta de correu brossa.",
          "A la porta n'hi ha prou amb ensenyar el codi. Cada codi serveix una sola vegada.",
          "Si perdeu el codi, escriviu a " +
            CORREU +
            " o pregunteu-ho a l'entrada: es pot recuperar amb el vostre nom o correu.",
        ],
      },
      {
        heading: "Si l'activitat canvia o s'anul·la",
        body: [
          "Si s'anul·la, es retorna l'import íntegre sense que hàgiu de demanar res.",
          "Si canvia de data o de lloc, us avisarem al correu amb què vau comprar. Si la data nova no us va bé, podeu demanar el retorn de l'import.",
          "L'organització es reserva el dret de no permetre l'accés a qui tingui una actitud que posi en risc la resta de participants. En aquest cas no hi ha retorn de l'import.",
        ],
      },
      {
        heading: "Edat",
        body: [
          "Per comprar cal ser major de 16 anys. Algunes activitats poden exigir ser major d'edat, i s'indica a la mateixa activitat.",
        ],
      },
    ],
  },

  {
    slug: "devolucions",
    title: "Devolucions i cancel·lacions",
    intro:
      "Aquesta pàgina explica quan podeu recuperar els diners i com demanar-ho. No és igual per a tots els productes.",
    sections: [
      {
        heading: "Entrades d'activitats amb data i hora concretes",
        body: [
          "La normativa de consum espanyola preveu que els serveis de lleure prestats en una data determinada quedin fora del dret de desistiment de 14 dies. Això vol dir que, un cop comprada, una entrada per a una activitat amb data fixada no es pot retornar només perquè hàgiu canviat de parer.",
          "Sí que es retorna l'import si l'activitat s'anul·la, o si en canvia la data i la nova no us va bé.",
          "Fora d'aquests casos, si teniu un motiu de pes escriviu a " +
            CORREU +
            " i s'estudiarà. No és un dret, però tampoc som una màquina.",
        ],
      },
      {
        heading: "Marxandatge",
        body: [
          "El marxandatge sí que té dret de desistiment: disposeu de 14 dies naturals des que el recolliu per tornar-lo sense haver de donar cap explicació.",
          "El producte s'ha de tornar sense fer servir i en condicions de tornar-se a vendre.",
          "Per exercir-lo, escriviu a " +
            CORREU +
            " dins d'aquests 14 dies i acordarem com fer-ho.",
        ],
      },
      {
        heading: "Com es retornen els diners",
        body: [
          "Sempre al mateix mitjà de pagament amb què vau comprar. No es fan retorns en efectiu ni a un altre compte.",
          "El retorn el tramita l'organització des de Stripe. Un cop fet, pot trigar uns dies hàbils a aparèixer al vostre extracte, segons el vostre banc.",
          "Quan es retorna una compra, el codi d'entrada deixa de ser vàlid immediatament i la plaça torna a posar-se a la venda.",
        ],
      },
      {
        heading: "Si teniu un problema amb el pagament",
        body: [
          `Escriviu a ${CORREU} abans de reclamar res al banc. La majoria d'incidències (un pagament que no apareix, un codi que no arriba) es resolen el mateix dia.`,
        ],
      },
    ],
  },

  {
    slug: "cookies",
    title: "Política de cookies",
    intro:
      "Aquest web fa servir les cookies mínimes per funcionar. No n'hi ha cap de publicitat ni de seguiment.",
    sections: [
      {
        heading: "Quines s'utilitzen",
        body: [
          "Una cookie que recorda en quin idioma voleu veure el web, perquè no l'hàgiu de triar cada vegada.",
          "Una cookie de sessió per a les persones que administren el web, que només existeix mentre hi estan connectades.",
          "Stripe pot utilitzar les seves pròpies cookies durant el pagament, a la seva pàgina, per detectar fraus. Aquest web no hi té accés.",
        ],
      },
      {
        heading: "Què NO s'utilitza",
        body: [
          "Cap cookie d'analítica. No es mesura qui visita el web ni què hi fa.",
          "Cap cookie de publicitat ni de xarxes socials.",
          "Cap perfil de comportament.",
        ],
      },
      {
        heading: "Per què no hi ha cap avís de cookies",
        body: [
          "Les cookies estrictament necessàries perquè un web funcioni no requereixen consentiment previ. Com que aquí no se n'utilitza cap altra, no hi ha cap finestra emergent a acceptar.",
          "Si algun dia s'hi afegís analítica, aquesta pàgina canviaria i apareixeria l'avís corresponent abans d'activar-la.",
        ],
      },
      {
        heading: "Com esborrar-les",
        body: [
          "Des de la configuració del vostre navegador, en qualsevol moment. El web continuarà funcionant: només oblidarà l'idioma que havíeu triat.",
        ],
      },
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((doc) => doc.slug === slug);
}
