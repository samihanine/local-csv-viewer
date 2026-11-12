import { describe, expect, it } from "vitest";
import { decodeText, parseCsv, serializeCsv, uniqueNames } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads quoted cells, escaped quotes and line breaks", () => {
    const { columns, rows } = parseCsv('name,note\r\n"Doe, Jane","say ""hi""\nbye"\r\nBob,\r\n');
    expect(columns).toEqual(["name", "note"]);
    expect(rows.map((row) => row.cells)).toEqual([
      ["Doe, Jane", 'say "hi"\nbye'],
      ["Bob", ""],
    ]);
  });

  it("detects the delimiter, line ending and BOM", () => {
    const { format, columns } = parseCsv("﻿a;b;c\r\n1;2;3");
    expect(columns).toEqual(["a", "b", "c"]);
    expect(format).toEqual({ delimiter: ";", eol: "\r\n", bom: true, finalNewline: false });
  });

  it("pads short rows, drops blank lines and names blank or duplicate headers", () => {
    const { columns, rows } = parseCsv("a,,a\n1\n\n4,5,6,7\n");
    expect(columns).toEqual(["a", "Colonne 2", "a (2)"]);
    expect(rows.map((row) => row.cells)).toEqual([
      ["1", "", ""],
      ["4", "5", "6"],
    ]);
  });
});

describe("serializeCsv", () => {
  it.each(["a,b\n1,2\n", "a;b\r\n1;2\r\n", '﻿name\tnote\n"x\ty"\t"line\nbreak"', 'a,b\n=1+1,"say ""hi"""\n'])(
    "round-trips %j byte for byte",
    (text) => {
      expect(serializeCsv(parseCsv(text))).toBe(text);
    },
  );

  it("quotes cells that need it", () => {
    const data = parseCsv("a,b\n");
    data.rows.push({ id: 0, cells: ["x,y", " padded "] });
    expect(serializeCsv(data)).toBe('a,b\n"x,y"," padded "\n');
  });
});

describe("helpers", () => {
  it("makes names unique without touching the first one", () => {
    expect(uniqueNames(["id", "ID", " ", "id"])).toEqual(["id", "ID (2)", "Colonne 3", "id (3)"]);
  });

  it("falls back to Windows-1252 for legacy files", () => {
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer)).toEqual({ text: "café", legacy: true });
    expect(decodeText(new TextEncoder().encode("café").buffer as ArrayBuffer).legacy).toBe(false);
  });
});
