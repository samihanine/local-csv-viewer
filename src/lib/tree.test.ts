import { describe, expect, it } from "vitest";
import { toRows } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";
import { descendants, resolveTree, treeOrder } from "@/lib/tree";

// id, title, parent, status, owner
const types: ColumnSchema[] = [
  { type: "id" },
  { type: "text" },
  { type: "parent" },
  { type: "select" },
  { type: "text" },
];
const rows = toRows(
  [
    ["1", "Epic", "", "En cours", "Léa"],
    ["2", "Story", "1", "", ""],
    ["3", "Task", "2", "Fait", ""],
    ["4", "Other", "", "", "Sami"],
    ["5", "Orphan", "99", "", ""],
  ],
  5,
);

describe("resolveTree", () => {
  const tree = resolveTree(rows, types, 1);

  it("fills empty cells from the parent, through several levels, except the title, id and parent", () => {
    expect(tree.rows[1]?.cells).toEqual(["2", "Story", "1", "En cours", "Léa"]);
    expect(tree.rows[2]?.cells).toEqual(["3", "Task", "2", "Fait", "Léa"]);
    expect(tree.inherited.get(1)).toEqual([false, false, false, true, true]);
    expect(tree.inherited.get(2)).toEqual([false, false, false, false, true]);
    expect(tree.rows[0]).toBe(rows[0]);
  });

  it("ignores unknown parents and cycles", () => {
    expect(tree.parentOf.has(4)).toBe(false);
    const cyclic = toRows(
      [
        ["1", "A", "2", "x", ""],
        ["2", "B", "1", "", ""],
      ],
      5,
    );
    const result = resolveTree(cyclic, types, 1);
    expect(result.rows.map((row) => row.cells[3])).toHaveLength(2);
    expect(result.parentOf.size).toBeLessThan(2);
  });

  it("orders children under their parent", () => {
    const { rows: ordered, depth } = treeOrder([rows[3], rows[2], rows[0], rows[1]] as typeof rows, tree.parentOf);
    expect(ordered.map((row) => row.cells[1])).toEqual(["Other", "Epic", "Story", "Task"]);
    expect(ordered.map((row) => depth.get(row.id))).toEqual([0, 0, 1, 2]);
    // A child whose parent is filtered out starts its own tree.
    expect(treeOrder([rows[2]] as typeof rows, tree.parentOf).depth.get(2)).toBe(0);
  });

  it("lists descendants", () => {
    expect([...descendants(0, tree.parentOf)].sort()).toEqual([0, 1, 2]);
  });
});
