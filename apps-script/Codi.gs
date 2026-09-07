/**
 * XIVARRI — relay de comandes pagades.
 *
 * Fa dues coses en una sola crida des del webhook de Stripe:
 *   1. afegeix una fila al full per cada entrada de la comanda,
 *   2. envia el correu amb els codis al comprador.
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

var FULL = 'Comandes';
var CAPCALERES = [
  'order_id', 'pagat_el', 'comprador', 'correu', 'telefon',
  'activitat', 'edicio', 'modalitat', 'unitats', 'preu_unitat_eur',
  'total_comanda_eur', 'metode', 'codi', 'enllac', 'respostes',
];

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

    var full = obtenirFull();

    // Idempotència: si la comanda ja hi és, no fem res i responem OK perquè
    // Stripe deixi de reintentar.
    if (jaHiEs(full, dades.order_id)) {
      return json({ ok: true, duplicat: true });
    }

    var files = (dades.items || []).map(function (item) {
      return [
        dades.order_id,
        dades.paid_at || '',
        dades.buyer_name || '',
        dades.buyer_email || '',
        dades.buyer_phone || '',
        dades.activity || '',
        dades.edition || '',
        item.item || '',
        item.quantity || 0,
        item.unit_price_eur || 0,
        dades.total_eur || 0,
        dades.payment_method || '',
        item.ticket_code || '',
        (dades.ticket_url_base || '') + (item.ticket_code || ''),
        respostesLlegibles(item.answers),
      ];
    });

    if (files.length) {
      full
        .getRange(full.getLastRow() + 1, 1, files.length, CAPCALERES.length)
        .setValues(files);
      SpreadsheetApp.flush();
    }

    // El correu va DESPRÉS de la fila. Si el correu falla (quota de Gmail
    // exhaurida, per exemple) la fila ja hi és, que és el que fa falta per a
    // l'organització. El comprador sempre té el codi a la pantalla.
    var correuEnviat = false;
    try {
      correuEnviat = enviarCorreu(dades);
    } catch (err) {
      console.error('correu fallit per ' + dades.order_id + ': ' + err);
    }

    return json({ ok: true, files: files.length, correu: correuEnviat });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function obtenirFull() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var full = doc.getSheetByName(FULL);
  if (!full) {
    full = doc.insertSheet(FULL);
  }
  if (full.getLastRow() === 0) {
    full.appendRow(CAPCALERES);
    full.setFrozenRows(1);
    full.getRange(1, 1, 1, CAPCALERES.length).setFontWeight('bold');
  }
  return full;
}

function jaHiEs(full, orderId) {
  var ultima = full.getLastRow();
  if (ultima < 2) return false;
  var ids = full.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === orderId) return true;
  }
  return false;
}

function respostesLlegibles(respostes) {
  if (!respostes) return '';
  return Object.keys(respostes)
    .map(function (clau) {
      return clau + ': ' + respostes[clau];
    })
    .join(' · ');
}

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

/**
 * Executa aquesta funció un cop des de l'editor per comprovar que el full es
 * crea i que el correu surt. No la fa servir el web.
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
        buyer_phone: '',
        activity: 'Activitat de prova',
        edition: 'Tardor 2026',
        payment_method: 'stripe',
        total_eur: 10,
        ticket_url_base: 'https://xivarri.xivarri.workers.dev/ca/t/',
        items: [
          { ticket_code: 'PROVA1', item: 'General', quantity: 1, unit_price_eur: 10, answers: {} },
        ],
      }),
    },
  });
  console.log(resultat.getContent());
}
