import { describe, expect, it } from "vitest";
import { type Row, toRows } from "@/lib/csv";
import { guessPhases, rowBars } from "@/lib/gantt";
import type { ColumnSchema } from "@/lib/schema";

const columns = ["id", "name", "description", "test_start_date", "test_end_date", "prod_start_date", "prod_end_date"];
const date: ColumnSchema = { type: "date", dateFormat: "iso" };
const types: ColumnSchema[] = [{ type: "id" }, { type: "text" }, { type: "longtext" }, date, date, date, date];

describe("gantt", () => {
  it("pairs start and end columns into phases", () => {
    const phases = guessPhases(columns, types);
    expect(phases.map((p) => [p.name, p.start, p.end])).toEqual([
      ["Test", "test_start_date", "test_end_date"],
      ["Prod", "prod_start_date", "prod_end_date"],
    ]);
    expect(phases[0]?.color).not.toBe(phases[1]?.color);
  });

  it("understands French names and untyped columns", () => {
    const phases = guessPhases(
      ["Titre", "Date de début", "Date de fin"],
      [{ type: "text" }, { type: "text" }, { type: "text" }],
    );
    expect(phases.map((p) => [p.start, p.end])).toEqual([["Date de début", "Date de fin"]]);
  });

  it("keeps only phases with both dates", () => {
    const phases = guessPhases(columns, types);
    const [full, half, none] = toRows(
      [
        ["1", "A", "", "2024-01-10", "2024-01-01", "2024-02-01", "2024-02-05"],
        ["2", "B", "", "2024-01-01", "", "2024-02-01", "2024-02-05"],
        ["3", "C", "", "", "2024-01-05", "nope", ""],
      ],
      7,
    );
    expect(rowBars(full as Row, columns, types, phases)).toEqual([
      { phase: phases[0], from: "2024-01-01", to: "2024-01-10" },
      { phase: phases[1], from: "2024-02-01", to: "2024-02-05" },
    ]);
    expect(rowBars(half as Row, columns, types, phases).map((b) => b.phase.name)).toEqual(["Prod"]);
    expect(rowBars(none as Row, columns, types, phases)).toEqual([]);
  });
});
