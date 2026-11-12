import { describe, expect, it } from "vitest";
import { toRows } from "@/lib/csv";
import {
  detectColumn,
  detectSchema,
  displayDate,
  formatDate,
  parseDate,
  parseSchemaFile,
  toSchemaFile,
} from "@/lib/schema";

describe("dates", () => {
  it("parses each format to an ISO day", () => {
    expect(parseDate("2024-03-05")).toBe("2024-03-05");
    expect(parseDate("2024-03-05T10:00:00Z")).toBe("2024-03-05");
    expect(parseDate("05/03/2024", "dmy")).toBe("2024-03-05");
    expect(parseDate("03/05/2024", "mdy")).toBe("2024-03-05");
    expect(parseDate("31/02/2024", "dmy")).toBeUndefined();
    expect(parseDate("soon")).toBeUndefined();
  });

  it("writes back in the column format", () => {
    expect(formatDate("2024-03-05", "dmy")).toBe("05/03/2024");
    expect(formatDate("2024-03-05", "mdy")).toBe("03/05/2024");
    expect(formatDate("2024-03-05")).toBe("2024-03-05");
    expect(displayDate("not a date")).toBe("not a date");
  });
});

describe("detectColumn", () => {
  it("finds dates and their format", () => {
    expect(detectColumn(["2024-01-02", "2024-02-03", ""])).toEqual({ type: "date", dateFormat: "iso" });
    expect(detectColumn(["25/01/2024", "02/03/2024"])).toEqual({ type: "date", dateFormat: "dmy" });
    expect(detectColumn(["01/25/2024", "02/03/2024"])).toEqual({ type: "date", dateFormat: "mdy" });
  });

  it("finds options when few values come back, most frequent first", () => {
    const detected = detectColumn(["Done", "Todo", "Done", "Doing", "Done", "Todo", "Doing"]);
    expect(detected.type).toBe("select");
    expect(detected.options?.map((option) => option.value)).toEqual(["Done", "Todo", "Doing"]);
    expect(new Set(detected.options?.map((option) => option.color)).size).toBe(3);
  });

  it("keeps the colors already chosen", () => {
    const previous = { type: "select" as const, options: [{ value: "Todo", color: "pink" as const }] };
    const detected = detectColumn(["Todo", "Todo", "Done", "Done"], previous);
    expect(detected.options?.find((option) => option.value === "Todo")?.color).toBe("pink");
  });

  it("finds long text", () => {
    const long = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);
    expect(detectColumn([long, `${long} bis`, "short"]).type).toBe("longtext");
    expect(detectColumn(["**bold** note", "- item\n- item", "x"]).type).toBe("longtext");
  });

  it("defaults to short text", () => {
    expect(detectColumn(["Alice", "Bob", "Carol", "Dave"]).type).toBe("text");
    expect(detectColumn(["", " "]).type).toBe("text");
  });

  it("detects every column of a table", () => {
    const rows = toRows(
      [
        ["Fix login", "Todo", "2024-01-02"],
        ["Ship v2", "Done", "2024-01-09"],
        ["Write docs", "Todo", "2024-02-01"],
        ["Hire", "Done", ""],
      ],
      3,
    );
    const schema = detectSchema(["Title", "Status", "Due"], rows);
    expect([schema.Title?.type, schema.Status?.type, schema.Due?.type]).toEqual(["text", "select", "date"]);
  });
});

describe("schema files", () => {
  it("round-trips", () => {
    const schema = { Status: { type: "select" as const, options: [{ value: "Todo", color: "blue" as const }] } };
    const file = toSchemaFile(["Title", "Status"], schema);
    expect(file.columns.Title).toEqual({ type: "text" });
    expect(parseSchemaFile(JSON.stringify(file))).toEqual(file.columns);
  });

  it("drops what it does not understand", () => {
    const parsed = parseSchemaFile(
      JSON.stringify({
        columns: {
          a: { type: "select", options: [{ value: "x", color: "neon" }, { value: "x" }, { value: 3 }, "y"], extra: 1 },
          b: { type: "script" },
          c: { type: "date", dateFormat: "nope" },
          __proto__: { type: "longtext" },
        },
      }),
    );
    expect(parsed.a).toEqual({ type: "select", options: [{ value: "x", color: "gray" }] });
    expect(parsed.b).toBeUndefined();
    expect(parsed.c).toEqual({ type: "date", dateFormat: "iso" });
    expect(({} as Record<string, unknown>).type).toBeUndefined();
  });

  it("rejects files that are not schemas", () => {
    expect(() => parseSchemaFile("nope")).toThrow();
    expect(() => parseSchemaFile("[]")).toThrow();
  });
});
