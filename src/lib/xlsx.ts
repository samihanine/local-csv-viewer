import { strToU8, zipSync } from "fflate";
import type { Row } from "@/lib/csv";
import { type ColumnType, columnSchema, parseDate, type Schema } from "@/lib/schema";

export const XLSX_MAX_ROWS = 1_048_575;
const CELL_MAX_CHARS = 32_767;
const HEADER_HEIGHT = 24;
const ROW_HEIGHT = 48;

/** Column widths in characters, by type. */
export const COLUMN_WIDTHS: Record<ColumnType, number> = { date: 14, select: 20, text: 28, longtext: 60 };

// Cell style ids, matching the order of <cellXfs> below.
const STYLE = { header: 1, text: 2, date: 3 };

const xml = (text: string) =>
  text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function columnLetter(index: number) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/** Excel stores days as a count since 1899-12-30. */
const excelDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000 + 25_569;

/** Table headers must be unique (case-insensitive), non-empty and on one line. */
function tableHeaders(columns: string[]) {
  const seen = new Set<string>();
  return columns.map((raw, i) => {
    const base = raw.replace(/\s+/g, " ").trim().slice(0, 255) || `Colonne ${i + 1}`;
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    seen.add(name.toLowerCase());
    return name;
  });
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml";

const CONTENT_TYPES = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYPE}.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="${TYPE}.table+xml"/><Override PartName="/xl/styles.xml" ContentType="${TYPE}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${TYPE}.sharedStrings+xml"/></Types>`;

const ROOT_RELS = `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;

const SHEET_RELS = `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/table" Target="../tables/table1.xml"/></Relationships>`;

const BORDER =
  '<left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/>';

// Every cell has a border on its four sides and wraps its text.
const STYLES = `${HEAD}<styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${BORDER}</border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;

/**
 * Builds a workbook with one sheet holding one Excel table anchored in A1.
 * Text is written as shared strings, never as formulas, so a cell starting with "=" cannot run.
 */
export function buildXlsx(columns: string[], rows: Row[], schema: Schema, sheetName = "Données") {
  const headers = tableHeaders(columns);
  const types = columns.map((column) => columnSchema(schema, column));
  const strings = new Map<string, number>();
  let stringCount = 0;
  const shared = (text: string) => {
    const value = text.slice(0, CELL_MAX_CHARS);
    stringCount++;
    let index = strings.get(value);
    if (index === undefined) {
      index = strings.size;
      strings.set(value, index);
    }
    return index;
  };

  const textCell = (ref: string, text: string, style: number) =>
    text === "" ? `<c r="${ref}" s="${style}"/>` : `<c r="${ref}" s="${style}" t="s"><v>${shared(text)}</v></c>`;

  const data = rows.slice(0, XLSX_MAX_ROWS);
  // A table needs at least one data row.
  const body = data.length ? data.map((row) => row.cells) : [columns.map(() => "")];
  const sheetRows = [
    `<row r="1" ht="${HEADER_HEIGHT}" customHeight="1">${headers.map((name, c) => textCell(`${columnLetter(c)}1`, name, STYLE.header)).join("")}</row>`,
  ];
  body.forEach((cells, r) => {
    const n = r + 2;
    const xmlCells = columns.map((_, c) => {
      const ref = `${columnLetter(c)}${n}`;
      const value = cells[c] ?? "";
      const type = types[c];
      const day = type?.type === "date" ? parseDate(value, type.dateFormat) : undefined;
      return day ? `<c r="${ref}" s="${STYLE.date}"><v>${excelDay(day)}</v></c>` : textCell(ref, value, STYLE.text);
    });
    sheetRows.push(`<row r="${n}" ht="${ROW_HEIGHT}" customHeight="1">${xmlCells.join("")}</row>`);
  });

  const lastColumn = columnLetter(Math.max(columns.length, 1) - 1);
  const ref = `A1:${lastColumn}${body.length + 1}`;
  const cols = types
    .map((type, c) => `<col min="${c + 1}" max="${c + 1}" width="${COLUMN_WIDTHS[type.type]}" customWidth="1"/>`)
    .join("");

  const sheet = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="${ref}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="${ROW_HEIGHT}" customHeight="1"/><cols>${cols}</cols><sheetData>${sheetRows.join("")}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`;

  const table = `${HEAD}<table xmlns="${NS}" id="1" name="Donnees" displayName="Donnees" ref="${ref}" totalsRowShown="0"><autoFilter ref="${ref}"/><tableColumns count="${headers.length}">${headers.map((name, c) => `<tableColumn id="${c + 1}" name="${xml(name)}"/>`).join("")}</tableColumns><tableStyleInfo showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"/></table>`;

  const sharedStrings = `${HEAD}<sst xmlns="${NS}" count="${stringCount}" uniqueCount="${strings.size}">${[...strings.keys()].map((text) => `<si><t xml:space="preserve">${xml(text)}</t></si>`).join("")}</sst>`;

  const safeSheetName = sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Feuille1";
  const workbook = `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${xml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/styles.xml": strToU8(STYLES),
    "xl/sharedStrings.xml": strToU8(sharedStrings),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/worksheets/_rels/sheet1.xml.rels": strToU8(SHEET_RELS),
    "xl/tables/table1.xml": strToU8(table),
  });
}

export const exportXlsx = (columns: string[], rows: Row[], schema: Schema) =>
  new Blob([buildXlsx(columns, rows, schema) as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
