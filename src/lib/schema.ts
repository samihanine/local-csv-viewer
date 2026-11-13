import type { Row } from "@/lib/csv";

export const COLUMN_TYPES = ["text", "longtext", "date", "select", "id"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const DATE_FORMATS = ["iso", "dmy", "mdy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const OPTION_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export type SelectOption = { value: string; color: OptionColor };
export type ColumnSchema = {
  type: ColumnType;
  options?: SelectOption[];
  dateFormat?: DateFormat;
  /** Identifier columns: text written before the number, e.g. "T-". */
  prefix?: string;
  /** Identifier columns: minimum number of digits, padded with zeros. */
  digits?: number;
  /** The column whose value names a row (one per schema). */
  title?: boolean;
};
export type Schema = Record<string, ColumnSchema>;

export const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Texte court",
  longtext: "Texte long",
  date: "Date",
  select: "Options",
  id: "Identifiant",
};

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: "AAAA-MM-JJ",
  dmy: "JJ/MM/AAAA",
  mdy: "MM/JJ/AAAA",
};

const DEFAULT_COLUMN: ColumnSchema = { type: "text" };
/** Own-property lookup: a column may be called "constructor" or "toString". */
export const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export const columnSchema = (schema: Schema, column: string): ColumnSchema => own(schema, column) ?? DEFAULT_COLUMN;

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Options are always listed in alphabetical order. */
export const sortOptions = (options: SelectOption[]) => [...options].sort((a, b) => collator.compare(a.value, b.value));

/** Index of the title column: the one marked with a star, or the first one. */
export function titleIndex(columns: string[], schema: Schema) {
  const index = columns.findIndex((column) => own(schema, column)?.title);
  return Math.max(0, index);
}

/** Sorts options and keeps a single title column. */
export function normalizeSchema(schema: Schema): Schema {
  let titled = false;
  return Object.fromEntries(
    Object.entries(schema).map(([column, value]) => {
      const next: ColumnSchema = { ...value };
      if (next.options) next.options = sortOptions(next.options);
      if (next.title && titled) delete next.title;
      if (next.title) titled = true;
      else delete next.title;
      return [column, next];
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Identifiers: text made of a prefix and a number, e.g. "T-007".

export const MAX_DIGITS = 12;

export const formatId = (n: number, { prefix = "", digits = 0 }: ColumnSchema) =>
  `${prefix}${String(n).padStart(Math.min(digits, MAX_DIGITS), "0")}`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Number part of an identifier, or undefined when the value does not follow the column format. */
export function idNumber(value: string, { prefix = "" }: ColumnSchema) {
  const match = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`).exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** The identifier following the largest one in `values`. */
export function nextId(values: string[], schema: ColumnSchema) {
  let max = 0;
  for (const value of values) max = Math.max(max, idNumber(value, schema) ?? 0);
  return formatId(max + 1, schema);
}

// Order in which colors are handed out: neighbours are far apart on the color wheel. Gray is kept for unknown values.
const ASSIGN_ORDER: OptionColor[] = ["blue", "green", "amber", "red", "purple", "teal", "pink", "orange", "indigo"];

/** First color not used yet. `offset` shifts the starting point so that columns do not all look alike. */
export const nextColor = (used: SelectOption[], offset = 0): OptionColor => {
  const palette = ASSIGN_ORDER.map((_, i) => ASSIGN_ORDER[(i + offset) % ASSIGN_ORDER.length] as OptionColor);
  const free = palette.find((color) => !used.some((option) => option.color === color));
  return free ?? palette[used.length % palette.length] ?? "blue";
};

// ---------------------------------------------------------------------------------------------------------------------
// Dates. The CSV keeps its own textual format; the app works with ISO days (YYYY-MM-DD).

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/;
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T ].*)?$/;

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

const validDay = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** Returns the ISO day of a cell, or undefined when it is not a date in the given format. */
export function parseDate(value: string, format: DateFormat = "iso"): string | undefined {
  const text = value.trim();
  const iso = ISO.exec(text);
  const slashed = iso ? null : SLASHED.exec(text);
  if (!iso && !slashed) return;
  const [a, b, c] = (iso ?? slashed ?? []).slice(1, 4).map(Number) as [number, number, number];
  const [y, m, d] = iso ? [a, b, c] : format === "mdy" ? [c, a, b] : [c, b, a];
  return validDay(y, m, d) ? `${pad(y, 4)}-${pad(m)}-${pad(d)}` : undefined;
}

/** Writes an ISO day in the textual format used by the column. */
export function formatDate(iso: string, format: DateFormat = "iso") {
  const [y = "", m = "", d = ""] = iso.split("-");
  if (format === "dmy") return `${d}/${m}/${y}`;
  if (format === "mdy") return `${m}/${d}/${y}`;
  return iso;
}

const displayFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function displayDate(value: string, format: DateFormat = "iso") {
  const iso = parseDate(value, format);
  return iso ? displayFormat.format(new Date(`${iso}T00:00:00Z`)) : value;
}

// ---------------------------------------------------------------------------------------------------------------------
// Type detection.

const SAMPLE = 5000;
const MAX_OPTIONS = 12;
const MAX_OPTION_LENGTH = 40;

function detectDateFormat(values: string[]): DateFormat | undefined {
  let isoCount = 0;
  let firstOver12 = false;
  let secondOver12 = false;
  for (const value of values) {
    const text = value.trim();
    if (ISO.test(text)) isoCount++;
    else {
      const match = SLASHED.exec(text);
      if (!match) continue;
      if (Number(match[1]) > 12) firstOver12 = true;
      if (Number(match[2]) > 12) secondOver12 = true;
    }
  }
  const format: DateFormat = isoCount > values.length / 2 ? "iso" : secondOver12 && !firstOver12 ? "mdy" : "dmy";
  const valid = values.filter((value) => parseDate(value, format)).length;
  return valid >= values.length * 0.9 ? format : undefined;
}

const MARKDOWN = /(\*\*[^*]+\*\*|^#{1,3} |^[-*] |\[[^\]]+\]\([^)]+\))/m;

function isLongText(values: string[]) {
  const long = values.filter((value) => value.length > 120 || value.includes("\n") || MARKDOWN.test(value)).length;
  const average = values.reduce((sum, value) => sum + value.length, 0) / values.length;
  return long >= values.length * 0.2 || average > 80;
}

function detectOptions(values: string[]): string[] | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value.length > MAX_OPTION_LENGTH || value.includes("\n")) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (counts.size > MAX_OPTIONS) return;
  }
  // Options are few values that come back: on average each one is used at least twice.
  if (counts.size * 2 > values.length) return;
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

const ID_NAME = /(^|[\s_-])(id|ref|réf|code|n°|num(ero|éro)?)([\s_-]|$)/i;
const ID_VALUE = /^(\D*?)(\d+)$/;

/** Unique values sharing a prefix and ending with a number, in a column named like an identifier or prefixed. */
function detectId(values: string[], name: string): ColumnSchema | undefined {
  if (values.length < 2 || new Set(values).size !== values.length) return;
  const matches = values.map((value) => ID_VALUE.exec(value.trim()));
  const prefix = matches[0]?.[1];
  if (prefix === undefined || !matches.every((match) => match && match[1] === prefix)) return;
  if (!prefix && !ID_NAME.test(name)) return;
  const lengths = new Set(matches.map((match) => match?.[2]?.length));
  const padded = lengths.size === 1 && matches.some((match) => match?.[2]?.startsWith("0"));
  return { type: "id", prefix, digits: padded ? [...lengths][0] : 0 };
}

export function detectColumn(values: string[], previous?: ColumnSchema, colorOffset = 0, name = ""): ColumnSchema {
  const filled = values.filter((value) => value.trim() !== "").slice(0, SAMPLE);
  const title = previous?.title ? { title: true } : {};
  return { ...detectType(filled, previous, colorOffset, name), ...title };
}

function detectType(
  filled: string[],
  previous: ColumnSchema | undefined,
  colorOffset: number,
  name: string,
): ColumnSchema {
  if (!filled.length) return previous ?? { type: "text" };
  const id = detectId(filled, name);
  if (id) return id;
  const dateFormat = detectDateFormat(filled);
  if (dateFormat) return { type: "date", dateFormat };
  const detected = detectOptions(filled);
  if (detected) {
    const options: SelectOption[] = [];
    for (const value of detected) {
      const known = previous?.options?.find((option) => option.value === value);
      options.push(known ?? { value, color: nextColor(options, colorOffset) });
    }
    return { type: "select", options: sortOptions(options) };
  }
  return { type: isLongText(filled) ? "longtext" : "text" };
}

export function detectSchema(columns: string[], rows: Row[], previous: Schema = {}): Schema {
  return Object.fromEntries(
    columns.map((column, index) => [
      column,
      detectColumn(
        rows.map((row) => row.cells[index] ?? ""),
        own(previous, column),
        index * 4,
        column,
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// JSON import / export. Uploaded files are untrusted: every field is checked and unknown ones are dropped.

export type SchemaFile = { version: 1; columns: Schema };

export const toSchemaFile = (columns: string[], schema: Schema): SchemaFile => ({
  version: 1,
  columns: Object.fromEntries(columns.map((column) => [column, columnSchema(schema, column)])),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

function parseColumn(raw: unknown): ColumnSchema | undefined {
  if (!isRecord(raw) || !includes(COLUMN_TYPES, raw.type)) return;
  const column: ColumnSchema = { type: raw.type };
  if (raw.type === "date") column.dateFormat = includes(DATE_FORMATS, raw.dateFormat) ? raw.dateFormat : "iso";
  if (raw.type === "id") {
    column.prefix = typeof raw.prefix === "string" ? raw.prefix.slice(0, 20) : "";
    const digits = Number(raw.digits);
    column.digits = Number.isInteger(digits) ? Math.max(0, Math.min(MAX_DIGITS, digits)) : 0;
  }
  if (raw.title === true) column.title = true;
  if (raw.type === "select") {
    const seen = new Set<string>();
    column.options = (Array.isArray(raw.options) ? raw.options : []).flatMap((option): SelectOption[] => {
      if (!isRecord(option) || typeof option.value !== "string" || !option.value || seen.has(option.value)) return [];
      seen.add(option.value);
      return [
        { value: option.value.slice(0, 200), color: includes(OPTION_COLORS, option.color) ? option.color : "gray" },
      ];
    });
    column.options = sortOptions(column.options);
  }
  return column;
}

/** Throws a readable error when the file is not a schema. */
export function parseSchemaFile(json: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  if (!isRecord(raw) || !isRecord(raw.columns)) throw new Error("Ce fichier ne contient pas de schéma.");
  const schema: Schema = Object.create(null);
  for (const [name, value] of Object.entries(raw.columns)) {
    const column = parseColumn(value);
    if (column) schema[name] = column;
  }
  return normalizeSchema({ ...schema });
}
