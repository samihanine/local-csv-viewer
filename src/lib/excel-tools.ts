import { strToU8, zipSync } from "fflate";

/** A cell as read from a workbook. */
export type Cell = string | number | boolean | Date | null;
export type Sheet = { name: string; rows: Cell[][] };

const pad = (n: number) => String(n).padStart(2, "0");

/** Dates without a time are days; Excel stores them at midnight UTC. */
export function dateText(date: Date) {
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  return time === "00:00" ? day : `${day} ${time}`;
}

const numberFormat = new Intl.NumberFormat(undefined, { useGrouping: false, maximumFractionDigits: 15 });

/** How a cell is shown, and pasted: numbers use the decimal separator of this computer, as Excel expects. */
export function cellText(cell: Cell) {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return dateText(cell);
  if (typeof cell === "number") return numberFormat.format(cell);
  if (typeof cell === "boolean") return cell ? "VRAI" : "FAUX";
  return String(cell);
}

/** Reads the first sheet. Rows are padded to the same width. */
export async function readFirstSheet(file: File): Promise<Sheet> {
  // Loaded on demand: only this page needs the reader.
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const [first] = await readXlsxFile(file);
  const raw = (first?.data ?? []) as Cell[][];
  const width = Math.max(0, ...raw.map((row) => row.length));
  return {
    name: first?.sheet ?? "Feuille1",
    rows: raw.map((row) => Array.from({ length: width }, (_, i) => (row[i] ?? null) as Cell)),
  };
}

/**
 * Tab-separated text, as Excel puts on the clipboard. Cells holding a tab, a line break or a quote are quoted so
 * they stay in one cell when pasted.
 */
export function toClipboardText(rows: Cell[][]) {
  const quote = (text: string) => (/[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
  return rows.map((row) => row.map((cell) => quote(cellText(cell))).join("\t")).join("\r\n");
}

// ---------------------------------------------------------------------------------------------------------------------
// Plain workbook: one sheet, the values only, no styles, borders or table.

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml";

const xml = (text: string) =>
  text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const letter = (index: number) => {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
};

/** Values keep their type: numbers stay numbers, booleans stay booleans, text is never read as a formula. */
export function buildPlainXlsx({ name, rows }: Sheet) {
  const strings = new Map<string, number>();
  const shared = (text: string) => {
    const value = text.slice(0, 32_767);
    let index = strings.get(value);
    if (index === undefined) {
      index = strings.size;
      strings.set(value, index);
    }
    return index;
  };
  const cell = (value: Cell, ref: string) => {
    if (value === null || value === "") return "";
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    const text = value instanceof Date ? dateText(value) : String(value);
    return `<c r="${ref}" t="s"><v>${shared(text)}</v></c>`;
  };
  const sheetRows = rows.map(
    (row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(value, `${letter(c)}${r + 1}`)).join("")}</row>`,
  );
  const sheetName = name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Feuille1";
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYPE}.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${TYPE}.sharedStrings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `${HEAD}<worksheet xmlns="${NS}"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `${HEAD}<sst xmlns="${NS}" uniqueCount="${strings.size}">${[...strings.keys()].map((text) => `<si><t xml:space="preserve">${xml(text)}</t></si>`).join("")}</sst>`,
    ),
  });
}
