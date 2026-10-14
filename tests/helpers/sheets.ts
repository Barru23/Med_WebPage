import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

/**
 * Enough of Google Sheets to run `apps-script/Codi.gs` unmodified.
 *
 * The relay script is the one piece of this project that cannot be typechecked,
 * imported or deployed from here: it lives in a Google account and is pasted in
 * by hand. Running it against a fake spreadsheet is the only way to know that a
 * paid order still turns into the right row before someone finds out otherwise
 * on the night of an activity.
 *
 * The fake is deliberately strict about the grid: a real sheet starts at 26
 * columns and 1000 rows and throws when written past them, so this one does too.
 */
export class FakeSheet {
  readonly rows: unknown[][] = [];
  /** Number formats set on single cells, keyed "row,col" (1-based). */
  readonly formats = new Map<string, string>();
  private maxCols = 26;
  private maxRows = 1000;

  private readonly name: string;
  private readonly id: number;

  constructor(name: string, id: number) {
    this.name = name;
    this.id = id;
  }

  getName() { return this.name; }
  getSheetId() { return this.id; }
  getMaxColumns() { return this.maxCols; }
  getMaxRows() { return this.maxRows; }
  insertColumnsAfter(_after: number, count: number) { this.maxCols += count; }
  insertRowsAfter(_after: number, count: number) { this.maxRows += count; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  setFrozenRows() {}
  autoResizeColumns() {}
  deleteRow(row: number) { this.rows.splice(row - 1, 1); }

  appendRow(values: unknown[]) {
    if (values.length > this.maxCols) throw new Error("out of bounds (columns)");
    this.rows.push(values.slice());
  }

  getRange(row: number, col: number, numRows: number, numCols: number) {
    if (col + numCols - 1 > this.maxCols) throw new Error("out of bounds (columns)");
    if (row + numRows - 1 > this.maxRows) throw new Error("out of bounds (rows)");
    // The range methods deliberately retain their parent fake sheet.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const sheet = this;
    const range = {
      getValues() {
        return Array.from({ length: numRows }, (_, r) => {
          const source = sheet.rows[row - 1 + r] ?? [];
          return Array.from({ length: numCols }, (_, c) => source[col - 1 + c] ?? "");
        });
      },
      setValues(values: unknown[][]) {
        values.forEach((values_, r) => {
          const target = (sheet.rows[row - 1 + r] ??= []);
          values_.forEach((value, c) => { target[col - 1 + c] = value; });
        });
        return range;
      },
      setValue(value: unknown) {
        const target = (sheet.rows[row - 1] ??= []);
        target[col - 1] = value;
        return range;
      },
      clearContent() {
        for (let r = 0; r < numRows; r++) {
          const target = (sheet.rows[row - 1 + r] ??= []);
          for (let c = 0; c < numCols; c++) target[col - 1 + c] = "";
        }
        return range;
      },
      setFontWeight() { return range; },
      setNumberFormat(format: string) {
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) sheet.formats.set(`${row + r},${col + c}`, format);
        }
        return range;
      },
    };
    return range;
  }

  /** The header row, as the script actually left it. */
  headers(): string[] {
    return this.getRange(1, 1, 1, this.getLastColumn()).getValues()[0].map(String);
  }

  /** The number format of one cell, found by header, or undefined if left automatic. */
  formatAt(rowIndex: number, header: string): string | undefined {
    return this.formats.get(`${rowIndex},${this.headers().indexOf(header) + 1}`);
  }

  /** One data row keyed by header, which is how a human reads the sheet. */
  row(index: number): Record<string, unknown> {
    const headers = this.headers();
    const values = this.getRange(index, 1, 1, headers.length).getValues()[0];
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  }
}

export interface SentMail {
  to: string;
  subject: string;
  htmlBody: string;
  name: string;
}

export interface RelayHarness {
  /** POST a payload at the script, as the Cloudflare worker does. */
  post(payload: unknown): { ok: boolean; [key: string]: unknown };
  sheet(name: string): FakeSheet | undefined;
  mails: SentMail[];
  failNextMail(): void;
  runRetentionCleanup(): void;
  secret: string;
  /** How many times the script has taken its lock. */
  locksTaken(): number;
  /** Remove the secret from the script properties, as on a fresh deployment. */
  forgetSecret(): void;
  /** What the script itself would call the tab, for cross-checking `sheetTabName`. */
  tabNameFromScript(activity: string, edition?: string | null): string;
}

const SCRIPT = join(import.meta.dirname, "..", "..", "apps-script", "Codi.gs");

export function loadRelayScript(): RelayHarness {
  const sheets = new Map<string, FakeSheet>();
  const mails: SentMail[] = [];
  let pendingMailFailures = 0;
  let nextSheetId = 1;
  let locks = 0;
  const secret = "test-secret";
  // The deployed copy reads its secret from the script properties; here we
  // put the same one both sides of the call use.
  const properties = new Map<string, string>([["SHEETS_RELAY_SECRET", secret]]);

  const spreadsheet = {
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    getSheetById: (id: number) => [...sheets.values()].find((sheet) => sheet.getSheetId() === id) ?? null,
    insertSheet(name: string) {
      const sheet = new FakeSheet(name, nextSheetId++);
      sheets.set(name, sheet);
      return sheet;
    },
    deleteSheet(sheet: FakeSheet) { sheets.delete(sheet.getName()); },
  };

  const sandbox = {
    console: { error() {}, log() {} },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null }),
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
    MailApp: {
      sendEmail: (mail: SentMail) => {
        if (pendingMailFailures > 0) {
          pendingMailFailures--;
          throw new Error("mail quota exhausted");
        }
        mails.push(mail);
      },
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(text: string) {
        const output = { getContent: () => text, setMimeType: () => output };
        return output;
      },
    },
    Session: { getActiveUser: () => ({ getEmail: () => "organiser@example.com" }) },
  };

  createContext(sandbox);
  runInContext(readFileSync(SCRIPT, "utf8"), sandbox);

  return {
    post(payload) {
      const response = (sandbox as unknown as {
        doPost(e: { postData: { contents: string } }): { getContent(): string };
      }).doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(response.getContent());
    },
    sheet: (name) => sheets.get(name),
    tabNameFromScript(activity, edition) {
      return (sandbox as unknown as {
        nomPestanya(dades: { activity: string; edition?: string | null }): string;
      }).nomPestanya({ activity, edition });
    },
    mails,
    failNextMail() { pendingMailFailures++; },
    runRetentionCleanup() {
      (sandbox as unknown as { runRetentionCleanup(): void }).runRetentionCleanup();
    },
    secret,
    locksTaken: () => locks,
    forgetSecret() { properties.clear(); },
  };
}
