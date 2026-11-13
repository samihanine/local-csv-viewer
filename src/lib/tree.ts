import type { Row } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";

export const rowTitle = (row: Row, title: number) => row.cells[title]?.trim() || "Sans titre";

/** The column whose value a parent cell points to: the first identifier column, or else the title column. */
export function keyIndex(types: ColumnSchema[], title: number) {
  const id = types.findIndex((type) => type.type === "id");
  return id < 0 ? title : id;
}

/** Columns a child takes from its parent when its own cell is empty. */
export const inheritable = (types: ColumnSchema[], title: number) =>
  types.map((type, index) => index !== title && type.type !== "id" && type.type !== "parent");

export type Resolved = {
  /** Rows with inherited values filled in. Same ids and order as the input. */
  rows: Row[];
  /** For each row with a parent: which cells come from an ancestor. */
  inherited: Map<number, boolean[]>;
  /** Row id → parent row id. */
  parentOf: Map<number, number>;
  /** Key value → row, for parent pickers and labels. */
  byKey: Map<string, Row>;
};

/**
 * Resolves inheritance: a child's empty cell shows the value of its parent, which may itself come from the
 * grand-parent. Cycles and unknown parents are ignored.
 */
export function resolveTree(rows: Row[], types: ColumnSchema[], title: number): Resolved {
  const parentColumn = types.findIndex((type) => type.type === "parent");
  const key = keyIndex(types, title);
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    const value = (row.cells[key] ?? "").trim();
    if (value && !byKey.has(value)) byKey.set(value, row);
  }
  const inherited = new Map<number, boolean[]>();
  const parentOf = new Map<number, number>();
  if (parentColumn < 0) return { rows, inherited, parentOf, byKey };

  for (const row of rows) {
    const parent = byKey.get((row.cells[parentColumn] ?? "").trim());
    if (parent && parent.id !== row.id) parentOf.set(row.id, parent.id);
  }
  // A cycle (A → B → A) would make both rows their own ancestors: cut it at the first row reached twice.
  for (const start of [...parentOf.keys()]) {
    const seen = new Set<number>([start]);
    for (let id = parentOf.get(start); id !== undefined; id = parentOf.get(id)) {
      if (seen.has(id)) {
        parentOf.delete(start);
        break;
      }
      seen.add(id);
    }
  }

  const take = inheritable(types, title);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const resolved = new Map<number, Row>();
  const resolve = (row: Row): Row => {
    const done = resolved.get(row.id);
    if (done) return done;
    const parentId = parentOf.get(row.id);
    const parent = parentId === undefined ? undefined : byId.get(parentId);
    if (!parent) {
      resolved.set(row.id, row);
      return row;
    }
    const from = resolve(parent);
    const flags = row.cells.map((cell, i) => !!take[i] && cell.trim() === "" && (from.cells[i] ?? "") !== "");
    const result = flags.some(Boolean)
      ? { id: row.id, cells: row.cells.map((cell, i) => (flags[i] ? (from.cells[i] ?? "") : cell)) }
      : row;
    // A cell inherited by the parent is inherited by the child too.
    const parentFlags = inherited.get(parent.id);
    inherited.set(
      row.id,
      flags.map((flag, i) => flag || (!!parentFlags?.[i] && row.cells[i]?.trim() === "")),
    );
    resolved.set(row.id, result);
    return result;
  };
  return { rows: rows.map(resolve), inherited, parentOf, byKey };
}

/**
 * Puts each row right below its parent, keeping the given order among siblings. A row whose parent is not in the
 * list starts a new tree. Returns the rows and their depth.
 */
export function treeOrder(rows: Row[], parentOf: Map<number, number>) {
  const present = new Set(rows.map((row) => row.id));
  const children = new Map<number, Row[]>();
  const roots: Row[] = [];
  for (const row of rows) {
    const parent = parentOf.get(row.id);
    if (parent !== undefined && present.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(row);
      children.set(parent, list);
    } else roots.push(row);
  }
  const ordered: Row[] = [];
  const depth = new Map<number, number>();
  const visit = (row: Row, level: number) => {
    ordered.push(row);
    depth.set(row.id, level);
    for (const child of children.get(row.id) ?? []) visit(child, level + 1);
  };
  for (const root of roots) visit(root, 0);
  return { rows: ordered, depth, children };
}

/** Ids of a row and all its descendants: they cannot become its parent. */
export function descendants(id: number, parentOf: Map<number, number>) {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parentOf)
      if (result.has(parent) && !result.has(child)) {
        result.add(child);
        grew = true;
      }
  }
  return result;
}
