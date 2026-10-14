/**
 * XIVARRI — relay de comandes pagades.
 *
 * Fa dues coses en una sola crida des del webhook de Stripe:
 *   1. afegeix una fila al full per cada entrada de la comanda,
 *   2. envia el correu amb els codis al comprador.
 * També inclou un trigger diari de retenció; executeu
 * installDailyMaintenance() una vegada després de desplegar-lo.
 *
 * UNA PESTANYA PER ACTIVITAT I EDICIÓ, per exemple "Medifutbol — Tardor 2026".
 * L'edició hi és a posta: Medifutbol i Medipadel es reobren cada temporada
 * reutilitzant el mateix registre, i sense l'edició al nom el llistat d'octubre
 * acabaria barrejat amb el de març.
 *
 * Cada pestanya té les seves pròpies columnes: les preguntes personalitzades
 * d'aquella activitat (DNI, al·lèrgies, parada de bus, talla...) hi surten com
 * a columnes de veritat, que es poden ordenar i filtrar.
 *
 * Regles que no s'han de trencar:
 *   - El full és una CÒPIA. La base de dades del web mana sempre.
 *   - Idempotent per order_id: si Stripe reintenta, no es dupliquen files.
 *   - No exposa res: només accepta POST amb el secret correcte i no retorna
 *     mai cap dada del full.
 *   - El secret es llegeix de les propietats de l'script, mai d'aquest codi,
 *     i es comprova abans de bloquejar res.
 */

// El secret NO viu en aquest fitxer, que és públic. Es desa a l'editor
// d'Apps Script: Configuració del projecte → Propietats de l'script, amb
// aquest nom i el mateix valor que SHEETS_RELAY_SECRET a Cloudflare.
var PROPIETAT_SECRET = 'SHEETS_RELAY_SECRET';

// Columnes que porten text escrit per algú altre (el comprador o qui va crear
// l'activitat). Es formaten com a text pla perquè Sheets no les avaluï mai.
// Les preguntes personalitzades s'hi afegeixen per a cada comanda.
var COLUMNES_TEXT_LLIURE = ['comprador', 'correu', 'telefon', 'modalitat'];

// Columnes fixes, abans i després de les preguntes de cada activitat.
// El codi va primer perquè és el que es busca a la porta.
var COLUMNES_INICI = ['codi', 'comprador', 'correu', 'telefon', 'modalitat', 'unitats', 'preu_eur'];
var COLUMNES_FINAL = ['pagat_el', 'order_id', 'enllac'];

// Hi falten a posta el total de la comanda i el mètode de pagament. La fila és
// per entrada, i el total hi sortia repetit a cadascuna: qui sumava la columna
// d'una comanda de dues entrades de 5 € en veia 20. El diner que sí que quadra
// per fila ja hi és — preu_eur × unitats — i la xifra bona de debò és la de la
// pantalla de Vendes.

// Deliberadament NO hi ha columnes de "ha entrat" ni "ha recollit": la fila
// s'escriu un sol cop, en pagar, i es quedarien congelades mentint la nit de
// l'activitat. L'estat real viu a la pantalla de Porta i a l'Excel que es
// descarrega des de Vendes, que sempre estan al dia.

/** El secret desat a les propietats de l'script, o null si no s'hi ha posat. */
function secretConfigurat() {
  var valor = PropertiesService.getScriptProperties().getProperty(PROPIETAT_SECRET);
  return valor ? String(valor) : null;
}

/** Comparació que triga el mateix tant si l'error és al primer caràcter com a l'últim. */
function igualSegur(a, b) {
  var diferencia = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferencia === 0;
}

function doPost(e) {
  // L'autenticació va ABANS del lock. La URL /exec és pública per força
  // ("Qualsevol" hi té accés), i si el lock s'agafés primer, una pluja de
  // peticions falses el mantindria ocupat i les comandes de debò rebrien
  // "ocupat". Així, qui no porta el secret surt sense haver esperat res.
  // Apps Script no deixa llegir capçaleres HTTP, per això el secret va al cos
  // i no en una capçalera Authorization.
  var dades;
  try {
    dades = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return json({ ok: false, error: 'no autoritzat' });
  }
  var secret = secretConfigurat();
  if (!secret) console.error('Falta la propietat de l\'script ' + PROPIETAT_SECRET);
  if (!secret || !dades || typeof dades.secret !== 'string' || !igualSegur(dades.secret, secret)) {
    return json({ ok: false, error: 'no autoritzat' });
  }
  if (!dades.order_id) {
    return json({ ok: false, error: 'falta order_id' });
  }

  var lock = LockService.getScriptLock();
  // Dues entregues simultànies de Stripe no poden escriure alhora.
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, error: 'ocupat' });
  }

  try {
    var canals = Array.isArray(dades.channels) ? dades.channels : ['sheet', 'email'];
    var resultatFull = { sent: false, skipped: canals.indexOf('sheet') === -1 };
    var resultatCorreu = { sent: false, skipped: canals.indexOf('email') === -1 };
    var full = null;

    if (canals.indexOf('sheet') !== -1) {
      full = obtenirPestanya(dades);
      var duplicat = jaHiEs(full, dades.order_id);
      if (!duplicat) escriureFiles(full, dades);
      registrarMetadadesRetencio(full, dades);
      resultatFull = { sent: true, duplicate: duplicat };
    }

    if (canals.indexOf('email') !== -1) {
      var registre = obtenirRegistreRelay();
      if (emailJaEnviat(registre, dades.order_id)) {
        resultatCorreu = { sent: true, duplicate: true };
      } else {
        try {
          var enviat = enviarCorreu(dades);
          if (enviat) marcarEmailEnviat(registre, dades.order_id);
          resultatCorreu = { sent: enviat };
        } catch (err) {
          console.error('correu fallit per ' + dades.order_id + ': ' + err);
          resultatCorreu = { sent: false, error: String(err) };
        }
      }
    }

    return json({
      ok: true,
      sheet: resultatFull,
      email: resultatCorreu,
      // Compatibility for an old worker or a human running the test function.
      pestanya: full ? full.getName() : '',
      correu: resultatCorreu.sent,
      duplicat: Boolean(resultatFull.duplicate && resultatCorreu.duplicate),
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// A private delivery ledger decouples email retries from sheet idempotency.
// Marking happens only after MailApp succeeds, so a failed email can be retried
// without duplicating participant rows.
function obtenirRegistreRelay() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var full = doc.getSheetByName('_relay_log');
  if (!full) {
    full = doc.insertSheet('_relay_log');
    full.appendRow(['order_id', 'email_sent_at']);
    if (typeof full.hideSheet === 'function') full.hideSheet();
  }
  return full;
}

function emailJaEnviat(full, orderId) {
  var ultima = full.getLastRow();
  if (ultima < 2) return false;
  var ids = full.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === orderId) return true;
  }
  return false;
}

function marcarEmailEnviat(full, orderId) {
  ferLloc(full, 2, 1);
  full.appendRow([orderId, new Date().toISOString()]);
}

// ---------------------------------------------------------------------------
// Retenció de dades de les còpies de Google Sheets
// ---------------------------------------------------------------------------

function obtenirRegistreRetencio() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var full = doc.getSheetByName('_relay_meta');
  if (!full) {
    full = doc.insertSheet('_relay_meta');
    full.appendRow(['sheet_id', 'sheet_name', 'edition_ends_at', 'sensitive_columns', 'updated_at']);
    if (typeof full.hideSheet === 'function') full.hideSheet();
  }
  return full;
}

function registrarMetadadesRetencio(full, dades) {
  if (!dades.edition_ends_at) return;
  var classificacions = dades.field_classifications || {};
  var sensibles = Object.keys(classificacions).filter(function (etiqueta) {
    return classificacions[etiqueta] === 'identity' || classificacions[etiqueta] === 'health';
  });
  var registre = obtenirRegistreRetencio();
  var sheetId = full.getSheetId();
  var ultima = registre.getLastRow();
  var fila = 0;
  if (ultima >= 2) {
    var ids = registre.getRange(2, 1, ultima - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (Number(ids[i][0]) === sheetId) {
        fila = i + 2;
        break;
      }
    }
  }
  if (fila) {
    try {
      var anteriors = JSON.parse(String(registre.getRange(fila, 4, 1, 1).getValues()[0][0] || '[]'));
      if (Array.isArray(anteriors)) {
        anteriors.forEach(function (etiqueta) {
          if (sensibles.indexOf(etiqueta) === -1) sensibles.push(etiqueta);
        });
      }
    } catch (err) {
      // Un registre malmès es reconstrueix amb les metadades de la comanda actual.
    }
  }
  var valors = [
    sheetId,
    full.getName(),
    dades.edition_ends_at,
    JSON.stringify(sensibles),
    new Date().toISOString(),
  ];
  if (fila) registre.getRange(fila, 1, 1, valors.length).setValues([valors]);
  else {
    ferLloc(registre, valors.length, 1);
    registre.appendRow(valors);
  }
}

/** Executa aquesta funció una vegada després de desplegar l'script. */
function installDailyMaintenance() {
  var existeix = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'runRetentionCleanup';
  });
  if (!existeix) {
    ScriptApp.newTrigger('runRetentionCleanup').timeBased().everyDays(1).atHour(3).create();
  }
}

/** Elimina camps sensibles al cap de 24 h i la còpia sencera al cap de 12 mesos. */
function runRetentionCleanup() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var registre = doc.getSheetByName('_relay_meta');
  if (!registre || registre.getLastRow() < 2) return;
  var files = registre.getRange(2, 1, registre.getLastRow() - 1, 5).getValues();
  var ara = new Date();

  for (var i = files.length - 1; i >= 0; i--) {
    var dataFinal = new Date(files[i][2]);
    if (isNaN(dataFinal.getTime())) continue;
    var full = doc.getSheetById(Number(files[i][0]));
    if (!full) {
      registre.deleteRow(i + 2);
      continue;
    }

    var dotzeMesos = new Date(dataFinal.getTime());
    dotzeMesos.setUTCMonth(dotzeMesos.getUTCMonth() + 12);
    if (ara >= dotzeMesos) {
      doc.deleteSheet(full);
      registre.deleteRow(i + 2);
      continue;
    }

    if (ara.getTime() < dataFinal.getTime() + 24 * 60 * 60 * 1000) continue;
    var sensibles;
    try {
      sensibles = JSON.parse(String(files[i][3] || '[]'));
    } catch (err) {
      sensibles = [];
    }
    if (!Array.isArray(sensibles) || !sensibles.length || full.getLastRow() < 2) continue;
    var capcalera = full.getRange(1, 1, 1, full.getLastColumn()).getValues()[0].map(String);
    sensibles.forEach(function (etiqueta) {
      var columna = capcalera.indexOf(etiqueta);
      if (columna !== -1) {
        full.getRange(2, columna + 1, full.getLastRow() - 1, 1).clearContent();
      }
    });
    registre.getRange(i + 2, 4).setValue('[]');
  }
}

// ---------------------------------------------------------------------------
// Pestanyes
// ---------------------------------------------------------------------------

/** "Medifutbol — Tardor 2026". Sense edició, només el títol. */
function nomPestanya(dades) {
  var nom = String(dades.activity || 'Sense nom');
  if (dades.edition) nom += ' — ' + dades.edition;
  // Google Sheets no admet aquests caràcters als noms de pestanya, i talla a 100.
  return nom.replace(/[:\\\/\?\*\[\]]/g, '-').slice(0, 100);
}

function obtenirPestanya(dades) {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var nom = nomPestanya(dades);
  var full = doc.getSheetByName(nom);
  if (!full) {
    full = doc.insertSheet(nom);
  }
  return full;
}

/**
 * Una pestanya nova neix amb 26 columnes i 1.000 files. Una activitat amb
 * moltes preguntes, o una que vengui molt, se'n surt — i Sheets no eixampla la
 * graella sol: la crida peta amb "out of bounds" i la comanda es queda sense
 * fila. S'hi fa lloc abans d'escriure.
 */
function ferLloc(full, columnes, files) {
  var columnesDeMes = columnes - full.getMaxColumns();
  if (columnesDeMes > 0) full.insertColumnsAfter(full.getMaxColumns(), columnesDeMes);

  var filesDeMes = full.getLastRow() + files - full.getMaxRows();
  if (filesDeMes > 0) full.insertRowsAfter(full.getMaxRows(), filesDeMes);
}

/**
 * Sheets avalua com a fórmula qualsevol text que comenci per = + - @, i el nom
 * del comprador i les respostes del formulari els escriu ell. Un nom com
 * "=IMPORTXML(...)" s'executaria sol el dia que una organitzadora obrís el
 * full, amb els DNI i les al·lèrgies a la mateixa pestanya. Un apòstrof al
 * davant ho deixa en text: es veu igual i no s'avalua.
 *
 * Abans es treuen els espais, tabuladors i salts de línia del davant: "\t=..."
 * o " =..." també poden acabar avaluant-se, i ningú escriu el nom amb un
 * tabulador a propòsit. També es cobreixen les variants d'amplada completa
 * (＝ ＋ － ＠). És una segona barrera: escriureFiles ja formata aquestes
 * columnes com a text pla abans d'escriure-hi.
 */
function textSegur(valor) {
  if (typeof valor !== 'string') return valor;
  var net = valor.replace(/^[\s\u0000-\u001F]+/, '');
  return /^[=+\-@＝＋－＠]/.test(net) ? "'" + net : net;
}

/**
 * Capçaleres de la pestanya, ampliant-les si cal.
 *
 * Es llegeix el que ja hi ha i s'hi afegeix el que falti, en comptes de donar
 * per fet un ordre. Així, si l'endemà l'administradora afegeix una pregunta
 * nova a l'activitat, apareix una columna nova al final i les files velles
 * segueixen quadrant.
 */
function capcaleres(full, dades) {
  var volem = COLUMNES_INICI.concat(dades.field_labels || []).concat(COLUMNES_FINAL);

  if (full.getLastRow() === 0) {
    ferLloc(full, volem.length, 1);
    full.appendRow(volem);
    full.setFrozenRows(1);
    full.getRange(1, 1, 1, volem.length).setFontWeight('bold');
    full.autoResizeColumns(1, volem.length);
    return volem;
  }

  var actuals = full.getRange(1, 1, 1, full.getLastColumn()).getValues()[0].map(String);
  var falten = volem.filter(function (c) {
    return actuals.indexOf(c) === -1;
  });
  if (falten.length) {
    ferLloc(full, actuals.length + falten.length, 0);
    full
      .getRange(1, actuals.length + 1, 1, falten.length)
      .setValues([falten])
      .setFontWeight('bold');
    actuals = actuals.concat(falten);
  }
  return actuals;
}

function escriureFiles(full, dades) {
  var columnes = capcaleres(full, dades);

  var files = (dades.items || []).map(function (item) {
    var valors = {
      codi: item.ticket_code || '',
      comprador: dades.buyer_name || '',
      correu: dades.buyer_email || '',
      telefon: dades.buyer_phone || '',
      modalitat: item.item || '',
      unitats: item.quantity || 0,
      preu_eur: item.unit_price_eur || 0,
      pagat_el: dades.paid_at || '',
      // Aquests dos ja no són capçaleres noves, però les pestanyes obertes abans
      // del canvi encara tenen les columnes: mentre hi siguin s'omplen, i no es
      // queden a mitges. El dia que les esborreu a mà, no tornen.
      total_comanda_eur: dades.total_eur || 0,
      metode: dades.payment_method || '',
      order_id: dades.order_id,
      enllac: (dades.ticket_url_base || '') + (item.ticket_code || ''),
    };
    // Les respostes de les preguntes personalitzades, per etiqueta.
    var respostes = item.answers || {};
    Object.keys(respostes).forEach(function (etiqueta) {
      valors[etiqueta] = respostes[etiqueta];
    });

    // Els valors es col·loquen segons les capçaleres REALS de la pestanya, no
    // segons un ordre suposat.
    return columnes.map(function (c) {
      return valors[c] === undefined ? '' : textSegur(valors[c]);
    });
  });

  if (!files.length) return;

  ferLloc(full, columnes.length, files.length);
  var filaInici = full.getLastRow() + 1;

  // Text pla a les columnes que omple algú altre, ABANS d'escriure-hi: així
  // Sheets les desa tal com arriben i no intenta interpretar-les. Les dates,
  // els preus i les unitats es deixen en format automàtic perquè es puguin
  // ordenar i sumar.
  var textuals = COLUMNES_TEXT_LLIURE.concat(dades.field_labels || []);
  columnes.forEach(function (columna, index) {
    if (textuals.indexOf(columna) !== -1) {
      full.getRange(filaInici, index + 1, files.length, 1).setNumberFormat('@');
    }
  });

  full.getRange(filaInici, 1, files.length, columnes.length).setValues(files);
  SpreadsheetApp.flush();
}

function jaHiEs(full, orderId) {
  var ultima = full.getLastRow();
  if (ultima < 2) return false;

  var capcalera = full.getRange(1, 1, 1, full.getLastColumn()).getValues()[0].map(String);
  var col = capcalera.indexOf('order_id');
  if (col === -1) return false;

  var ids = full.getRange(2, col + 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === orderId) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Correu
// ---------------------------------------------------------------------------

function textosCorreu(locale) {
  if (locale === 'es') return {
    oneSubject: 'Tu entrada para ', manySubject: 'Tus entradas para ',
    view: 'Ver la entrada', hello: 'Hola ', readyOne: ', ya tienes tu entrada.',
    readyMany: ', ya tienes tus entradas.',
    instructions: 'Enseña el código en la entrada. Haz una captura de pantalla para tenerlo incluso sin cobertura.',
    order: 'Pedido ',
  };
  if (locale === 'en') return {
    oneSubject: 'Your ticket for ', manySubject: 'Your tickets for ',
    view: 'View ticket', hello: 'Hello ', readyOne: ', your ticket is ready.',
    readyMany: ', your tickets are ready.',
    instructions: 'Show the code at the door. Take a screenshot so you still have it without reception.',
    order: 'Order ',
  };
  return {
    oneSubject: 'La teva entrada per ', manySubject: 'Les teves entrades per ',
    view: "Veure l'entrada", hello: 'Hola ', readyOne: ', ja tens la teva entrada.',
    readyMany: ', ja tens les teves entrades.',
    instructions: "Ensenya el codi a l'entrada. Fes-ne una captura de pantalla: així el tindràs encara que et quedis sense cobertura.",
    order: 'Comanda ',
  };
}

function enviarCorreu(dades) {
  if (!dades.buyer_email) return false;

  var codis = (dades.items || []).map(function (item) {
    return item.ticket_code;
  });
  if (!codis.length) return false;

  var text = textosCorreu(dades.locale || 'ca');
  var activitat = dades.activity_display || dades.activity;
  var assumpte =
    codis.length === 1
      ? text.oneSubject + activitat + ': ' + codis[0]
      : text.manySubject + activitat + ' (' + codis.length + ')';

  var blocs = (dades.items || [])
    .map(function (item) {
      return (
        '<div style="border:1px solid #DCCDB8;padding:16px;margin:12px 0;text-align:center">' +
        '<div style="font:11px/1.4 monospace;letter-spacing:.2em;text-transform:uppercase;color:#666">' +
        escapar(item.item) +
        '</div>' +
        '<div style="font:700 34px/1.2 monospace;letter-spacing:.25em;color:#141414;margin:10px 0">' +
        escapar(item.ticket_code) +
        '</div>' +
        '<a href="' +
        dades.ticket_url_base +
        item.ticket_code +
        '" style="font:12px sans-serif;color:#E1281C">' + text.view + '</a>' +
        '</div>'
      );
    })
    .join('');

  var cos =
    '<div style="max-width:520px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#141414;background:#F2E7D8;padding:24px">' +
    '<h1 style="font:700 26px/1.2 Georgia,serif;margin:0 0 4px">XIVARRI</h1>' +
    '<p style="font:13px/1.5 sans-serif;color:#555;margin:0 0 18px">' +
    escapar(activitat) +
    (dades.edition ? ' · ' + escapar(dades.edition) : '') +
    '</p>' +
    '<p style="font:15px/1.5 sans-serif">' + text.hello +
    escapar(dades.buyer_name) +
    (codis.length === 1 ? text.readyOne : text.readyMany) +
    '</p>' +
    blocs +
    '<p style="font:13px/1.5 sans-serif;color:#555">' +
    text.instructions + '</p>' +
    '<p style="font:11px/1.5 sans-serif;color:#888;border-top:1px solid #DCCDB8;padding-top:12px">' +
    text.order +
    escapar(dades.order_id) +
    ' · ' +
    dades.total_eur +
    ' €</p>' +
    '</div>';

  MailApp.sendEmail({
    to: dades.buyer_email,
    subject: assumpte,
    htmlBody: cos,
    name: 'XIVARRI',
  });
  return true;
}

function escapar(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ---------------------------------------------------------------------------
// Prova
// ---------------------------------------------------------------------------

/**
 * Executa aquesta funció un cop des de l'editor per comprovar que la pestanya
 * es crea, que les preguntes surten com a columnes i que el correu arriba.
 * No la fa servir el web. Deixa una pestanya "Prova — Tardor 2026" que pots
 * esborrar després.
 */
function provaLocal() {
  var resultat = doPost({
    postData: {
      contents: JSON.stringify({
        secret: secretConfigurat(),
        order_id: 'ord_prova_' + Date.now(),
        paid_at: '2026-01-01 20:00:00',
        buyer_name: 'Prova Prova',
        buyer_email: Session.getActiveUser().getEmail(),
        buyer_phone: '600000000',
        activity: 'Prova',
        edition: 'Tardor 2026',
        field_labels: ['DNI', 'Al·lèrgies'],
        payment_method: 'stripe',
        total_eur: 20,
        ticket_url_base: 'https://xivarri.xivarri.workers.dev/ca/t/',
        items: [
          {
            ticket_code: 'PROVA1',
            item: 'Amb bus',
            quantity: 1,
            unit_price_eur: 10,
            answers: { DNI: '12345678Z', 'Al·lèrgies': 'cap' },
          },
          {
            ticket_code: 'PROVA2',
            item: 'Amb bus',
            quantity: 1,
            unit_price_eur: 10,
            answers: { DNI: '87654321X', 'Al·lèrgies': 'fruits secs' },
          },
        ],
      }),
    },
  });
  console.log(resultat.getContent());
}
