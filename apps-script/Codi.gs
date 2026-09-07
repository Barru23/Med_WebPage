/**
 * XIVARRI — relay de comandes pagades.
 *
 * Fa dues coses en una sola crida des del webhook de Stripe:
 *   1. afegeix una fila al full per cada entrada de la comanda,
 *   2. envia el correu amb els codis al comprador.
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
 */

// Ha de coincidir amb el secret SHEETS_RELAY_SECRET de Cloudflare.
// Canvia'l per una cadena llarga i aleatòria abans de desplegar.
var SECRET = 'ENGANXA_AQUI_EL_SECRET';

// Columnes fixes, abans i després de les preguntes de cada activitat.
// El codi va primer perquè és el que es busca a la porta.
var COLUMNES_INICI = ['codi', 'comprador', 'correu', 'telefon', 'modalitat', 'unitats', 'preu_eur'];
var COLUMNES_FINAL = ['pagat_el', 'total_comanda_eur', 'metode', 'order_id', 'enllac'];

// Deliberadament NO hi ha columnes de "ha entrat" ni "ha recollit": la fila
// s'escriu un sol cop, en pagar, i es quedarien congelades mentint la nit de
// l'activitat. L'estat real viu a la pantalla de Porta i a l'Excel que es
// descarrega des de Vendes, que sempre estan al dia.

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Dues entregues simultànies de Stripe no poden escriure alhora.
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, error: 'ocupat' });
  }

  try {
    var dades = JSON.parse(e.postData.contents);

    if (!dades.secret || dades.secret !== SECRET) {
      return json({ ok: false, error: 'no autoritzat' });
    }
    if (!dades.order_id) {
      return json({ ok: false, error: 'falta order_id' });
    }

    var full = obtenirPestanya(dades);

    // Idempotència: si la comanda ja hi és, no fem res i responem OK perquè
    // Stripe deixi de reintentar.
    if (jaHiEs(full, dades.order_id)) {
      return json({ ok: true, duplicat: true });
    }

    escriureFiles(full, dades);

    // El correu va DESPRÉS de les files. Si el correu falla (quota de Gmail
    // exhaurida, per exemple) el llistat ja hi és, que és el que fa falta per a
    // l'organització. El comprador sempre té el codi a la pantalla.
    var correuEnviat = false;
    try {
      correuEnviat = enviarCorreu(dades);
    } catch (err) {
      console.error('correu fallit per ' + dades.order_id + ': ' + err);
    }

    return json({ ok: true, pestanya: full.getName(), correu: correuEnviat });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
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
      return valors[c] === undefined ? '' : valors[c];
    });
  });

  if (!files.length) return;

  full.getRange(full.getLastRow() + 1, 1, files.length, columnes.length).setValues(files);
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

function enviarCorreu(dades) {
  if (!dades.buyer_email) return false;

  var codis = (dades.items || []).map(function (item) {
    return item.ticket_code;
  });
  if (!codis.length) return false;

  var assumpte =
    codis.length === 1
      ? 'La teva entrada per ' + dades.activity + ': ' + codis[0]
      : 'Les teves ' + codis.length + ' entrades per ' + dades.activity;

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
        '" style="font:12px sans-serif;color:#E1281C">Veure l\'entrada</a>' +
        '</div>'
      );
    })
    .join('');

  var cos =
    '<div style="max-width:520px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#141414;background:#F2E7D8;padding:24px">' +
    '<h1 style="font:700 26px/1.2 Georgia,serif;margin:0 0 4px">XIVARRI</h1>' +
    '<p style="font:13px/1.5 sans-serif;color:#555;margin:0 0 18px">' +
    escapar(dades.activity) +
    (dades.edition ? ' · ' + escapar(dades.edition) : '') +
    '</p>' +
    '<p style="font:15px/1.5 sans-serif">Hola ' +
    escapar(dades.buyer_name) +
    ', ja tens ' +
    (codis.length === 1 ? 'la teva entrada' : 'les teves entrades') +
    '.</p>' +
    blocs +
    '<p style="font:13px/1.5 sans-serif;color:#555">' +
    'Ensenya el codi a l\'entrada. Fes-ne una captura de pantalla: així el tindràs ' +
    'encara que et quedis sense cobertura.</p>' +
    '<p style="font:11px/1.5 sans-serif;color:#888;border-top:1px solid #DCCDB8;padding-top:12px">' +
    'Comanda ' +
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
        secret: SECRET,
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
