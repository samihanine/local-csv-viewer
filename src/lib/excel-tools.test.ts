import { strFromU8, unzipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { buildPlainXlsx, cellText, toClipboardText } from "@/lib/excel-tools";

describe("excel tools", () => {
  it("shows cells as text", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(new Date("2024-03-05T00:00:00Z"))).toBe("2024-03-05");
    expect(cellText(new Date("2024-03-05T14:30:00Z"))).toBe("2024-03-05 14:30");
    expect(cellText(true)).toBe("VRAI");
    expect(cellText(12)).toBe("12");
  });

  it("copies as tab-separated text, quoting cells that would break the grid", () => {
    expect(
      toClipboardText([
        ["a", 1, null],
        ["x\ty", 'say "hi"', "line\nbreak"],
      ]),
    ).toBe('a\t1\t\r\n"x\ty"\t"say ""hi"""\t"line\nbreak"');
  });

  it("writes a plain workbook that reads back with the same values", async () => {
    const bytes = buildPlainXlsx({
      name: "Ventes: 2024",
      rows: [
        ["Nom", "Montant", "Payé", "Formule"],
        ["Alice", 12.5, true, "=1+1"],
        ["Bob", null, false, ""],
      ],
    });
    const files = unzipSync(bytes);
    expect(Object.keys(files)).not.toContain("xl/styles.xml");
    expect(Object.keys(files)).not.toContain("xl/tables/table1.xml");
    expect(strFromU8(files["xl/workbook.xml"] as Uint8Array)).toContain('name="Ventes  2024"');
    expect(strFromU8(files["xl/worksheets/sheet1.xml"] as Uint8Array)).not.toContain("<f>");
    const data = await readSheet(Buffer.from(bytes));
    expect(data).toEqual([
      ["Nom", "Montant", "Payé", "Formule"],
      ["Alice", 12.5, true, "=1+1"],
      ["Bob", null, false, null],
    ]);
  });
});
