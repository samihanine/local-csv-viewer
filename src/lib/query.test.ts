import { describe, expect, it } from "vitest";
import { toRows } from "@/lib/csv";
import { runQuery } from "@/lib/query";
import type { Schema } from "@/lib/schema";

const columns = ["Title", "Status", "Due"];
const rows = toRows(
  [
    ["Écrire la doc", "Todo", "05/03/2024"],
    ["Fix login", "Done", "20/01/2024"],
    ["Ship v10", "", ""],
    ["Ship v2", "Todo", "01/02/2024"],
  ],
  3,
);
const schema: Schema = { Status: { type: "select" }, Due: { type: "date", dateFormat: "dmy" } };
const titles = (query: Partial<Parameters<typeof runQuery>[3]>) =>
  runQuery(columns, rows, schema, { search: "", filters: {}, ...query }).map((row) => row.cells[0]);

describe("runQuery", () => {
  it("returns everything by default", () => {
    expect(titles({})).toHaveLength(4);
  });

  it("searches every column, ignoring case and accents", () => {
    expect(titles({ search: "ecrire" })).toEqual(["Écrire la doc"]);
    expect(titles({ search: "DONE" })).toEqual(["Fix login"]);
  });

  it("filters by text, options and date range together", () => {
    expect(titles({ filters: { Title: { text: "ship" } } })).toEqual(["Ship v10", "Ship v2"]);
    expect(titles({ filters: { Status: { values: ["Done", ""] } } })).toEqual(["Fix login", "Ship v10"]);
    expect(titles({ filters: { Due: { from: "2024-02-01", to: "2024-03-05" } } })).toEqual([
      "Écrire la doc",
      "Ship v2",
    ]);
    expect(titles({ filters: { Title: { text: "ship" }, Status: { values: ["Todo"] } } })).toEqual(["Ship v2"]);
  });

  it("ignores empty filters and filters on missing columns", () => {
    expect(titles({ filters: { Title: { text: " " }, Status: { values: [] }, Gone: { text: "x" } } })).toHaveLength(4);
  });

  it("sorts naturally, by real date, with empty cells last", () => {
    expect(titles({ sort: { column: "Title", desc: false } })).toEqual([
      "Écrire la doc",
      "Fix login",
      "Ship v2",
      "Ship v10",
    ]);
    expect(titles({ sort: { column: "Due", desc: false } })).toEqual([
      "Fix login",
      "Ship v2",
      "Écrire la doc",
      "Ship v10",
    ]);
    expect(titles({ sort: { column: "Due", desc: true } })).toEqual([
      "Écrire la doc",
      "Ship v2",
      "Fix login",
      "Ship v10",
    ]);
  });
});
