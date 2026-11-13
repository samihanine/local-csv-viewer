import type { Filters, Sort } from "@/lib/query";
import type { OptionColor, Schema } from "@/lib/schema";

export const MODES = ["table", "kanban", "gallery", "gantt"] as const;
export type Mode = (typeof MODES)[number];

/** A bar of the gantt: one date column for the start, one for the end. */
export type Phase = { id: string; name: string; start: string; end: string; color: OptionColor };

/** What a saved view remembers. `hidden` only changes what the view shows: the CSV keeps every column. */
export type ViewState = {
  mode: Mode;
  search: string;
  filters: Filters;
  sort?: Sort;
  groupBy?: string;
  hidden?: string[];
  /** Gantt phases. Undefined means "guess them from the date columns". */
  phases?: Phase[];
};

/** Indexes of the columns a view shows, in file order. */
export function displayColumns(columns: string[], { hidden = [] }: Pick<ViewState, "hidden">) {
  const hiddenSet = new Set(hidden);
  return columns.map((_, index) => index).filter((index) => !hiddenSet.has(columns[index] ?? ""));
}

export type SavedView = { id: string; name: string; state: ViewState };

/** Everything known about one CSV, except its file handle (kept in IndexedDB under the same id). */
export type FileEntry = {
  id: string;
  name: string;
  schema: Schema;
  views: SavedView[];
  state: ViewState;
  activeViewId?: string;
};

export type Registry = { files: FileEntry[]; activeId?: string };

export const REGISTRY_KEY = "local-csv-viewer:v1";
const KEY = REGISTRY_KEY;

export const defaultState = (): ViewState => ({ mode: "table", search: "", filters: {} });

export const newEntry = (id: string, name: string): FileEntry => ({
  id,
  name,
  schema: {},
  views: [],
  state: defaultState(),
});

export function loadRegistry(): Registry {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object" && Array.isArray((raw as Registry).files)) {
      const { files, activeId } = raw as Registry;
      const valid = files.filter((file) => file && typeof file.id === "string" && typeof file.name === "string");
      // Older versions had a "detail" mode, now a side panel.
      const fixState = (state: ViewState): ViewState => ({
        ...defaultState(),
        ...state,
        mode: MODES.includes(state?.mode) ? state.mode : "table",
      });
      return {
        files: valid.map((file) => ({
          ...newEntry(file.id, file.name),
          ...file,
          state: fixState(file.state),
          views: (file.views ?? []).map((view) => ({ ...view, state: fixState(view.state) })),
        })),
        activeId: valid.some((file) => file.id === activeId) ? activeId : valid[0]?.id,
      };
    }
  } catch {}
  return { files: [] };
}

export function saveRegistry(registry: Registry) {
  try {
    localStorage.setItem(KEY, JSON.stringify(registry));
  } catch {}
}

export const sameState = (a: ViewState, b: ViewState) => JSON.stringify(a) === JSON.stringify(b);
