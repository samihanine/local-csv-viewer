import { strFromU8, unzipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { toRows } from "@/lib/csv";
import { buildXlsx, columnLetter } from "@/lib/xlsx";

const columns = ["Title", "Notes", "Due", "Status", "title"];
const rows = toRows(
  [
    ["=1+1", 'a <b> & "c"\nline 2', "05/03/2024", "Todo", ""],
    ["Second", "", "not a date", "Done", "x"],
  ],
  5,
);
const schema = {
  Notes: { type: "longtext" as const },
  Due: { type: "date" as const, dateFormat: "dmy" as const },
  Status: { type: "select" as const },
};
const bytes = buildXlsx(columns, rows, schema);
const files = Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, data]) => [name, strFromU8(data)]));
const sheet = files["xl/worksheets/sheet1.xml"] ?? "";

describe("buildXlsx", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });

  it("puts one table in A1 covering every cell, with unique headers", () => {
    const table = files["xl/tables/table1.xml"] ?? "";
    expect(table).toContain('ref="A1:E3"');
    expect(table).toContain('<tableColumn id="5" name="title (2)"/>');
    expect(sheet).toContain('<tableParts count="1">');
  });

  it("sizes columns by type and rows uniformly", () => {
    expect([...sheet.matchAll(/<col [^>]*width="(\d+)"/g)].map((match) => match[1])).toEqual([
      "28",
      "60",
      "14",
      "20",
      "28",
    ]);
    const heights = [...sheet.matchAll(/<row r="\d+" ht="(\d+)" customHeight="1">/g)].map((match) => match[1]);
    expect(heights).toEqual(["24", "48", "48"]);
  });

  it("gives every cell a bordered, wrapping style", () => {
    const styles = [...sheet.matchAll(/<c r="[A-Z]+\d+" s="(\d)"/g)].map((match) => match[1]);
    expect(styles).toHaveLength(15);
    expect(styles.every((style) => style !== "0")).toBe(true);
    const xfs = [...(files["xl/styles.xml"] ?? "").matchAll(/<xf [^>]*borderId="1"[^>]*>.*?<\/xf>/g)];
    expect(xfs).toHaveLength(3);
    expect(xfs.every((xf) => xf[0].includes('wrapText="1"'))).toBe(true);
  });

  it("never writes formulas, and writes real dates", () => {
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('<c r="C2" s="3"><v>45356</v></c>');
  });

  it("can be read back", async () => {
    const data = await readSheet(Buffer.from(bytes));
    expect(data[0]).toEqual(["Title", "Notes", "Due", "Status", "title (2)"]);
    expect(data[1]?.slice(0, 2)).toEqual(["=1+1", 'a <b> & "c"\nline 2']);
    expect(data[1]?.[2]).toEqual(new Date("2024-03-05T00:00:00Z"));
    expect(data[2]).toEqual(["Second", null, "not a date", "Done", "x"]);
  });
});
