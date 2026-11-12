import { createContext, useContext } from "react";
import type { Row } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";
import type { ViewState } from "@/lib/workspace-store";

/** What the display modes need to show and edit the open file. */
export type ViewContext = {
  columns: string[];
  /** Schema of each column, in column order. */
  types: ColumnSchema[];
  /** Indexes of the columns shown by the view, in display order. */
  display: number[];
  /** Every row of the file. */
  rows: Row[];
  /** Rows left after search, filters and sort. */
  visible: Row[];
  state: ViewState;
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
  /** Shows a row in the detail view. */
  openRow: (rowId: number) => void;
  selectRow: (rowId: number) => void;
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
