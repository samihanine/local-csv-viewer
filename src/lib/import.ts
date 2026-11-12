import { decodeText, parseCsv, uniqueNames } from "@/lib/csv";
import { columnSchema, formatDate, type Schema } from "@/lib/schema";

export type Table = { columns: string[]; rows: string[][] };
/** Where an imported column goes: an existing column, a new one, or nowhere. */
export type Target = { kind: "column"; name: string } | { kind: "new" } | { kind: "skip" };
export type ImportMode = "append" | "replace";

const pad = (n: number) => String(n).padStart(2, "0");

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    const time = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
    return time === "00:00" ? day : `${day} ${time}`;
  }
  return String(value);
}

export async function readTable(file: File): Promise<Table> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded on demand: the reader is only needed for imports.
    const { readSheet } = await import("read-excel-file/browser");
    const [header = [], ...rows] = await readSheet(file);
    const columns = uniqueNames(header.map(cellText));
    return { columns, rows: rows.map((row) => columns.map((_, i) => cellText(row[i]))) };
  }
  const { columns, rows } = parseCsv(decodeText(await file.arrayBuffer()).text);
  return { columns, rows: rows.map((row) => row.cells) };
}

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Matches imported columns to existing ones by name, ignoring case, accents and punctuation. */
export function autoMap(imported: string[], existing: string[]): Target[] {
  const free = new Map(existing.map((name) => [normalize(name), name]));
  return imported.map((name) => {
    const match = free.get(normalize(name));
    if (!match) return { kind: "new" };
    free.delete(normalize(name));
    return { kind: "column", name: match };
  });
}

/** True when both files have exactly the same columns, in any order. */
export const sameColumns = (imported: string[], existing: string[]) =>
  imported.length === existing.length && [...imported].sort().join("\n") === [...existing].sort().join("\n");

/** Returns the new column list and records, laid out for it. */
export function applyMapping(table: Table, targets: Target[], existing: string[], schema: Schema): Table {
  const columns = [...existing];
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  const destination = table.columns.map((name, i) => {
    const target = targets[i] ?? { kind: "skip" };
    if (target.kind === "skip") return -1;
    if (target.kind === "column") return columns.indexOf(target.name);
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${name} (${n})`;
    taken.add(unique.toLowerCase());
    return columns.push(unique) - 1;
  });
  const formats = columns.map((column) => {
    const { type, dateFormat } = columnSchema(schema, column);
    return type === "date" && dateFormat && dateFormat !== "iso" ? dateFormat : undefined;
  });
  const rows = table.rows.map((source) => {
    const cells = columns.map(() => "");
    destination.forEach((to, from) => {
      if (to < 0) return;
      const value = source[from] ?? "";
      const format = formats[to];
      // Excel dates arrive as ISO days: rewrite them the way the target column writes its dates.
      cells[to] = format && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value, format) : value;
    });
    return cells;
  });
  return { columns, rows };
}
