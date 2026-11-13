import type { Filter, Filters } from "@/lib/query";
import { OPTION_COLORS } from "@/lib/schema";
import { defaultState, MODES, type Phase, type ViewState } from "@/lib/workspace-store";

// The address of a tab says which tool, file, saved view and view settings it shows, so several tabs can show
// different views. It lives after "#": that part never reaches a server and works from a file:// page.

export type Page = "csv" | "excel";
export type UrlState = { page?: Page; file?: string; view?: string; state?: ViewState };

const MAX_TEXT = 500;
const MAX_ITEMS = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max = MAX_TEXT) => (typeof value === "string" ? value.slice(0, max) : undefined);
const texts = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_ITEMS)
        .map((item) => item.slice(0, MAX_TEXT))
    : undefined;
const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

function sanitizeFilter(raw: unknown): Filter | undefined {
  if (!isRecord(raw)) return;
  const filter: Filter = {};
  const t = text(raw.text);
  const values = texts(raw.values);
  const [from, to] = [day(raw.from), day(raw.to)];
  if (t !== undefined) filter.text = t;
  if (values) filter.values = values;
  if (from) filter.from = from;
  if (to) filter.to = to;
  return filter;
}

function sanitizePhase(raw: unknown): Phase | undefined {
  if (!isRecord(raw)) return;
  const [id, name, start, end] = [text(raw.id, 100), text(raw.name, 100), text(raw.start), text(raw.end)];
  if (id === undefined || name === undefined || start === undefined || end === undefined) return;
  const color = OPTION_COLORS.find((c) => c === raw.color) ?? "blue";
  return { id, name, start, end, color };
}

/** Keeps only well-formed settings: a view state can come from an address typed or pasted by anyone. */
export function sanitizeState(raw: unknown): ViewState | undefined {
  if (!isRecord(raw)) return;
  const state = defaultState();
  const mode = MODES.find((m) => m === raw.mode);
  if (mode) state.mode = mode;
  state.search = text(raw.search) ?? "";
  if (isRecord(raw.filters)) {
    const filters: Filters = {};
    for (const [column, value] of Object.entries(raw.filters).slice(0, MAX_ITEMS)) {
      const filter = sanitizeFilter(value);
      if (filter) Object.defineProperty(filters, column, { value: filter, enumerable: true, writable: true });
    }
    state.filters = filters;
  }
  if (isRecord(raw.sort) && typeof raw.sort.column === "string")
    state.sort = { column: raw.sort.column.slice(0, MAX_TEXT), desc: raw.sort.desc === true };
  const groupBy = text(raw.groupBy);
  if (groupBy !== undefined) state.groupBy = groupBy;
  const hidden = texts(raw.hidden);
  if (hidden) state.hidden = hidden;
  if (Array.isArray(raw.phases))
    state.phases = raw.phases
      .slice(0, 50)
      .map(sanitizePhase)
      .filter((phase): phase is Phase => !!phase);
  return state;
}

/** Reads the address. `errors` lists what was ignored, to tell the user. */
export function parseHash(hash: string): UrlState & { errors: string[] } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const result: UrlState & { errors: string[] } = { errors: [] };
  const page = params.get("p");
  if (page === "csv" || page === "excel") result.page = page;
  else if (page) result.errors.push("outil inconnu");
  const file = params.get("f");
  if (file) result.file = file.slice(0, 100);
  const view = params.get("v");
  if (view) result.view = view.slice(0, 100);
  const raw = params.get("s");
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const state = sanitizeState(parsed);
    if (state) result.state = state;
    else result.errors.push("réglages d'affichage illisibles");
  }
  return result;
}

export function buildHash({ page, file, view, state }: UrlState) {
  const params = new URLSearchParams();
  if (page) params.set("p", page);
  if (file) params.set("f", file);
  if (view) params.set("v", view);
  if (state) params.set("s", JSON.stringify(state));
  const query = params.toString();
  return query ? `#${query}` : "";
}

// ---------------------------------------------------------------------------------------------------------------------
// One shared copy of the address: the tool switcher and the CSV workspace each own part of it.

let current: UrlState = {};
let written = "";

/** Writes the address without adding a history entry. */
function write(hash: string) {
  if (hash === written) return;
  written = hash;
  const url = `${location.pathname}${location.search}${hash}`;
  try {
    history.replaceState(history.state, "", url || location.pathname);
  } catch {
    // Some file:// pages refuse replaceState: changing the hash this way does not reload the page either.
    location.replace(hash || "#");
  }
}

export function updateHash(patch: Partial<UrlState>) {
  current = { ...current, ...patch };
  write(buildHash(current));
}

/** The address when the page opened, parsed once. */
export const initialHash = typeof location === "undefined" ? { errors: [] } : parseHash(location.hash);
current = { page: initialHash.page, file: initialHash.file, view: initialHash.view, state: initialHash.state };

type Listener = (state: ReturnType<typeof parseHash>) => void;
const listeners = new Set<Listener>();

/** One handler for the whole page, so that every listener hears the same change. */
function onWindowHashChange() {
  if (location.hash === written) return;
  written = location.hash;
  const parsed = parseHash(location.hash);
  current = { page: parsed.page, file: parsed.file, view: parsed.view, state: parsed.state };
  for (const listener of listeners) listener(parsed);
}

/** Calls `listener` when the user edits the address or pastes another one in this tab. */
export function onHashChange(listener: Listener) {
  if (!listeners.size) window.addEventListener("hashchange", onWindowHashChange);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("hashchange", onWindowHashChange);
  };
}
