export type CsvFormat = { delimiter: string; eol: "\r\n" | "\n"; bom: boolean; finalNewline: boolean };
export type Row = { id: number; cells: string[] };
export type Dataset = { columns: string[]; rows: Row[]; format: CsvFormat };

export const DEFAULT_FORMAT: CsvFormat = { delimiter: ",", eol: "\n", bom: false, finalNewline: true };

const DELIMITERS = [",", ";", "\t", "|"];

/** Picks the candidate that appears most often in the header line, outside quotes. */
function detectDelimiter(text: string) {
  const counts = new Map(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return DELIMITERS.reduce((best, d) => ((counts.get(d) ?? 0) > (counts.get(best) ?? 0) ? d : best), ",");
}

/** RFC 4180 parser: quoted cells, escaped quotes, line breaks inside quotes. */
export function parseRecords(text: string, delimiter: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endCell = () => {
    record.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
  };
  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\n") endRecord();
    else if (char === "\r") {
      if (text[i + 1] === "\n") i++;
      endRecord();
    } else cell += char;
    i++;
  }
  if (cell !== "" || record.length) endRecord();
  return records;
}

/** Makes header names usable as keys: no blanks, no duplicates. */
export function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names.map((raw, i) => {
    const base = raw.trim() || `Colonne ${i + 1}`;
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    seen.add(name.toLowerCase());
    return name;
  });
}

export const toRows = (records: string[][], width: number, firstId = 0): Row[] =>
  records.map((record, i) => ({
    id: firstId + i,
    cells: Array.from({ length: width }, (_, j) => record[j] ?? ""),
  }));

export function parseCsv(input: string): Dataset {
  const bom = input.startsWith("\uFEFF");
  const text = bom ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const firstBreak = text.indexOf("\n");
  const eol = firstBreak > 0 && text[firstBreak - 1] === "\r" ? "\r\n" : "\n";
  const [header = [], ...records] = parseRecords(text, delimiter);
  const columns = uniqueNames(header);
  // Blank trailing lines are not rows.
  const filled = records.filter((record) => record.length > 1 || record[0] !== "");
  return {
    columns,
    rows: toRows(filled, columns.length),
    format: { delimiter, eol, bom, finalNewline: text === "" || /[\r\n]$/.test(text) },
  };
}

const escapeCell = (value: string, delimiter: string) =>
  /["\r\n]/.test(value) || value.includes(delimiter) || /^\s|\s$/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;

export function serializeCsv({ columns, rows, format }: Dataset) {
  const line = (cells: string[]) => cells.map((cell) => escapeCell(cell, format.delimiter)).join(format.delimiter);
  const body = [line(columns), ...rows.map((row) => line(row.cells))].join(format.eol);
  return `${format.bom ? "\uFEFF" : ""}${body}${format.finalNewline ? format.eol : ""}`;
}

/** Decodes UTF-8, falling back to Windows-1252 (legacy Excel exports). */
export function decodeText(buffer: ArrayBuffer) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer), legacy: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buffer), legacy: true };
  }
}
