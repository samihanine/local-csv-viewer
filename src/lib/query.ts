import type { Row } from "@/lib/csv";
import { columnSchema, own, parseDate, type Schema } from "@/lib/schema";

/** One filter per column. Which fields apply depends on the column type. */
export type Filter = { text?: string; values?: string[]; from?: string; to?: string };
export type Filters = Record<string, Filter>;
export type Sort = { column: string; desc: boolean };
export type Query = { search: string; filters: Filters; sort?: Sort };

export const isActive = (filter: Filter | undefined, type: string) => {
  if (!filter) return false;
  if (type === "select") return !!filter.values?.length;
  if (type === "date") return !!filter.from || !!filter.to;
  return !!filter.text?.trim();
};

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase();

type Test = (cells: string[]) => boolean;

export function runQuery(columns: string[], rows: Row[], schema: Schema, { search, filters, sort }: Query): Row[] {
  const tests: Test[] = [];
  columns.forEach((column, index) => {
    const filter = own(filters, column);
    const { type, dateFormat } = columnSchema(schema, column);
    if (!filter || !isActive(filter, type)) return;
    if (type === "select") {
      const allowed = new Set(filter.values);
      tests.push((cells) => allowed.has(cells[index] ?? ""));
    } else if (type === "date") {
      const { from, to } = filter;
      tests.push((cells) => {
        const day = parseDate(cells[index] ?? "", dateFormat);
        return !!day && (!from || day >= from) && (!to || day <= to);
      });
    } else {
      const needle = fold(filter.text?.trim() ?? "");
      tests.push((cells) => fold(cells[index] ?? "").includes(needle));
    }
  });
  const term = fold(search.trim());
  if (term) tests.push((cells) => cells.some((cell) => fold(cell).includes(term)));

  const result = tests.length ? rows.filter((row) => tests.every((test) => test(row.cells))) : rows;

  const sortIndex = sort ? columns.indexOf(sort.column) : -1;
  if (!sort || sortIndex < 0) return result;
  const { type, dateFormat } = columnSchema(schema, sort.column);
  const key = (row: Row) => {
    const cell = row.cells[sortIndex] ?? "";
    return type === "date" ? (parseDate(cell, dateFormat) ?? "") : cell;
  };
  const direction = sort.desc ? -1 : 1;
  // Empty cells always go last.
  return [...result].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return direction * collator.compare(x, y);
  });
}
