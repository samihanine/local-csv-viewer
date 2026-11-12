import type { Filters, Sort } from "@/lib/query";
import type { Schema } from "@/lib/schema";

export const MODES = ["table", "detail", "kanban", "gallery"] as const;
export type Mode = (typeof MODES)[number];

/** What a saved view remembers. */
export type ViewState = { mode: Mode; search: string; filters: Filters; sort?: Sort; groupBy?: string };
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

const KEY = "local-csv-viewer:v1";

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
      return {
        files: valid.map((file) => ({ ...newEntry(file.id, file.name), ...file })),
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
