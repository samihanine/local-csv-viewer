import { describe, expect, it } from "vitest";
import { applyMapping, autoMap, sameColumns } from "@/lib/import";

describe("import mapping", () => {
  it("matches columns by name, ignoring case, accents and punctuation", () => {
    expect(autoMap(["titre", "Échéance", "Other", "TITRE"], ["Titre", "echeance"])).toEqual([
      { kind: "column", name: "Titre" },
      { kind: "column", name: "echeance" },
      { kind: "new" },
      { kind: "new" },
    ]);
  });

  it("compares column sets regardless of order", () => {
    expect(sameColumns(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameColumns(["a"], ["a", "b"])).toBe(false);
  });

  it("lays rows out for the existing columns, adding and skipping as asked", () => {
    const table = { columns: ["due", "name", "junk", "Name"], rows: [["2024-03-05", "A", "x", "extra"]] };
    const result = applyMapping(
      table,
      [{ kind: "column", name: "Due" }, { kind: "column", name: "Name" }, { kind: "skip" }, { kind: "new" }],
      ["Name", "Status", "Due"],
      { Due: { type: "date", dateFormat: "dmy" } },
    );
    expect(result.columns).toEqual(["Name", "Status", "Due", "Name (2)"]);
    expect(result.rows).toEqual([["A", "", "05/03/2024", "extra"]]);
  });
});
