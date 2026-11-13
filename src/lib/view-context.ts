import { createContext, useContext } from "react";
import type { Row } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";
import type { ViewState } from "@/lib/workspace-store";

/** What the display modes need to show and edit the open file. */
export type ViewContext = {
  columns: string[];
  /** Schema of each column, in column order. */
  types: ColumnSchema[];
  /** Index of the column that names a row. */
  title: number;
  /** Indexes of the columns shown by the view, in display order. */
  display: number[];
  /** Every row of the file. */
  rows: Row[];
  /** Rows left after search, filters and sort. Cells hold inherited values. */
  visible: Row[];
  state: ViewState;
  /** Which cells of a row come from its parent. */
  inherited: Map<number, boolean[]>;
  /** Row id → parent row id. */
  parentOf: Map<number, number>;
  /** Value of the key column → row: what a parent cell points to. */
  byKey: Map<string, Row>;
  /** Index of the key column (first identifier column, or the title). */
  keyColumn: number;
  selectedId: number | undefined;
  setViewState: (patch: Partial<ViewState>) => void;
  updateCell: (rowId: number, column: number, value: string) => void;
  setColumnSchema: (column: string, schema: ColumnSchema) => void;
  /** Adds a row. Returns its id. */
  createRow: (values?: Record<number, string>) => number | undefined;
  /** Adds a row and shows its form. */
  newRow: (values?: Record<number, string>) => void;
  /** Deletes a row, with an undo toast. */
  removeRow: (rowId: number) => void;
  /** Shows a row in the side panel, or closes the panel when it already shows it. */
  openRow: (rowId: number) => void;
  /** Shows a row in the side panel. */
  selectRow: (rowId: number) => void;
  closeRow: () => void;
  /** Opens the filter editor of a column. */
  editFilter: (column: string) => void;
  openSchema: () => void;
};

const Context = createContext<ViewContext | null>(null);
export const ViewProvider = Context.Provider;

export function useView() {
  const view = useContext(Context);
  if (!view) throw new Error("useView must be used inside a ViewProvider");
  return view;
}
