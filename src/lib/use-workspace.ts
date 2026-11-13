import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type Dataset, DEFAULT_FORMAT, decodeText, parseCsv, type Row, serializeCsv, toRows } from "@/lib/csv";
import {
  createCsvFile,
  deleteHandle,
  hasPermission,
  lastModified,
  loadHandle,
  pickCsvFile,
  readHandle,
  requestPermission,
  saveHandle,
  writeHandle,
} from "@/lib/files";
import type { ImportMode, Table } from "@/lib/import";
import { columnSchema, formatId, idNumber, normalizeSchema, type Schema } from "@/lib/schema";
import {
  defaultState,
  type FileEntry,
  loadRegistry,
  newEntry,
  type Registry,
  saveRegistry,
  type ViewState,
} from "@/lib/workspace-store";

export type Status = "idle" | "loading" | "permission" | "missing" | "ready";

/** The open file. `saved` is what is on disk, `data` the draft shown and edited until "Enregistrer". */
type Session = {
  id: string;
  handle: FileSystemFileHandle;
  saved: Dataset;
  data: Dataset;
  modified: number;
  nextRowId: number;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const WATCH_INTERVAL = 3000;
const DISCARD = "Les modifications non enregistrées seront perdues. Continuer ?";

/** Fills the empty identifier cells of `rows`, continuing after the largest identifier of `all`. */
function assignIds(columns: string[], schema: Schema, all: Row[], rows: Row[]) {
  columns.forEach((column, index) => {
    const type = columnSchema(schema, column);
    if (type.type !== "id") return;
    let max = 0;
    for (const row of all) max = Math.max(max, idNumber(row.cells[index] ?? "", type) ?? 0);
    for (const row of rows) if (!(row.cells[index] ?? "").trim()) row.cells[index] = formatId(++max, type);
  });
}

export function useWorkspace() {
  const [registry, setRegistry] = useState<Registry>(loadRegistry);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<Dataset>();
  const [saved, setSaved] = useState<Dataset>();
  /** Schema edited but not saved yet. Undefined when it matches the stored one. */
  const [draftSchema, setDraftSchema] = useState<Schema>();
  const [diskChanged, setDiskChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const session = useRef<Session | undefined>(undefined);
  const pending = useRef<FileSystemFileHandle | undefined>(undefined);

  useEffect(() => saveRegistry(registry), [registry]);

  const { activeId } = registry;
  const entry = useMemo(() => registry.files.find((file) => file.id === activeId), [registry.files, activeId]);
  const schema = draftSchema ?? entry?.schema ?? {};
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const dirty = (!!data && data !== saved) || draftSchema !== undefined;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /** Asks before throwing away unsaved changes. */
  const confirmDiscard = useCallback(() => !dirtyRef.current || window.confirm(DISCARD), []);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateEntry = useCallback((change: (entry: FileEntry) => FileEntry) => {
    setRegistry((current) => ({
      ...current,
      files: current.files.map((file) => (file.id === current.activeId ? change(file) : file)),
    }));
  }, []);

  // ---- Reading -----------------------------------------------------------------------------------------------------

  const read = useCallback(async (id: string, handle: FileSystemFileHandle, isCurrent: () => boolean) => {
    const { buffer, lastModified: modified } = await readHandle(handle);
    if (!isCurrent()) return;
    const { text, legacy } = decodeText(buffer);
    const parsed = parseCsv(text);
    // Legacy encodings are saved back as UTF-8 with a BOM, which Excel reads correctly.
    if (legacy) parsed.format.bom = true;
    session.current = { id, handle, saved: parsed, data: parsed, modified, nextRowId: parsed.rows.length };
    setData(parsed);
    setSaved(parsed);
    setDraftSchema(undefined);
    setDiskChanged(false);
    setStatus("ready");
  }, []);

  useEffect(() => {
    let stale = false;
    session.current = undefined;
    pending.current = undefined;
    setData(undefined);
    setSaved(undefined);
    setDraftSchema(undefined);
    setDiskChanged(false);
    if (!activeId) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    (async () => {
      const handle = await loadHandle(activeId);
      if (stale) return;
      if (!handle) return setStatus("missing");
      pending.current = handle;
      if (!(await hasPermission(handle))) return !stale && setStatus("permission");
      await read(activeId, handle, () => !stale);
    })().catch((error) => {
      if (stale) return;
      setStatus("missing");
      toast.error(`Impossible d'ouvrir le fichier : ${message(error)}`);
    });
    return () => {
      stale = true;
    };
  }, [activeId, read]);

  // Notices changes made to the file by another program. Reloading is left to the "Recharger" button.
  useEffect(() => {
    const check = async () => {
      const current = session.current;
      if (!current || document.hidden) return;
      const modified = await lastModified(current.handle).catch(() => undefined);
      if (session.current === current && modified !== undefined && modified !== current.modified) setDiskChanged(true);
    };
    const timer = setInterval(check, WATCH_INTERVAL);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  /** Reads the file again from the disk, dropping the draft. */
  const refresh = useCallback(async () => {
    const current = session.current;
    if (!current || !confirmDiscard()) return;
    try {
      await read(current.id, current.handle, () => session.current === current);
      toast.success("Fichier rechargé depuis le disque");
    } catch (error) {
      toast.error(`Lecture impossible : ${message(error)}`);
    }
  }, [read, confirmDiscard]);

  // ---- Saving ------------------------------------------------------------------------------------------------------

  const save = useCallback(async () => {
    const current = session.current;
    if (!current || !dirtyRef.current || saving) return;
    if (
      diskChanged &&
      !window.confirm("Le fichier a été modifié par un autre programme. L'écraser avec vos modifications ?")
    )
      return;
    setSaving(true);
    try {
      const draft = current.data;
      if (draft !== current.saved) {
        current.modified = await writeHandle(current.handle, serializeCsv(draft));
        current.saved = draft;
        setSaved(draft);
      }
      if (draftSchema !== undefined) {
        const committed = draftSchema;
        updateEntry((entry) => ({ ...entry, schema: committed }));
        setDraftSchema(undefined);
      }
      setDiskChanged(false);
      toast.success("Modifications enregistrées");
    } catch (error) {
      toast.error(`Écriture impossible : ${message(error)}`);
    } finally {
      setSaving(false);
    }
  }, [saving, diskChanged, draftSchema, updateEntry]);

  /** Drops every change made since the last save. */
  const discard = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.data = current.saved;
    setData(current.saved);
    setDraftSchema(undefined);
  }, []);

  const mutate = useCallback((change: (data: Dataset, current: Session) => Dataset) => {
    const current = session.current;
    if (!current) return;
    current.data = change(current.data, current);
    setData(current.data);
  }, []);

  // ---- Rows --------------------------------------------------------------------------------------------------------

  const updateCell = useCallback(
    (rowId: number, column: number, value: string) =>
      mutate((current) => {
        const index = current.rows.findIndex((row) => row.id === rowId);
        const row = current.rows[index];
        if (!row || row.cells[column] === value) return current;
        const rows = [...current.rows];
        rows[index] = { id: rowId, cells: row.cells.with(column, value) };
        return { ...current, rows };
      }),
    [mutate],
  );

  const addRow = useCallback(
    (values: Record<number, string> = {}) => {
      let id: number | undefined;
      mutate((current, live) => {
        id = live.nextRowId++;
        const row = { id, cells: current.columns.map((_, i) => values[i] ?? "") };
        assignIds(current.columns, schemaRef.current, current.rows, [row]);
        return { ...current, rows: [...current.rows, row] };
      });
      return id;
    },
    [mutate],
  );

  const deleteRow = useCallback(
    (rowId: number) => mutate((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== rowId) })),
    [mutate],
  );

  /** Puts a deleted row back where it was. */
  const insertRow = useCallback(
    (row: Row, index: number) =>
      mutate((current) => {
        const cells = current.columns.map((_, i) => row.cells[i] ?? "");
        return { ...current, rows: current.rows.toSpliced(index, 0, { id: row.id, cells }) };
      }),
    [mutate],
  );

  /** Gives an identifier to every row of an identifier column that has none. Returns how many were filled. */
  const fillIds = useCallback(
    (column: string) => {
      let filled = 0;
      mutate((current) => {
        const index = current.columns.indexOf(column);
        if (index < 0) return current;
        const rows = current.rows.map((row) => ({ id: row.id, cells: [...row.cells] }));
        const empty = rows.filter((row) => !(row.cells[index] ?? "").trim());
        filled = empty.length;
        if (!filled) return current;
        assignIds([column], schemaRef.current, rows, empty);
        return { ...current, rows };
      });
      return filled;
    },
    [mutate],
  );

  // ---- Schema and columns ------------------------------------------------------------------------------------------

  const setSchema = useCallback(
    (next: Schema) => {
      const normalized = normalizeSchema(next);
      setDraftSchema(JSON.stringify(normalized) === JSON.stringify(entry?.schema ?? {}) ? undefined : normalized);
    },
    [entry?.schema],
  );

  const addColumn = useCallback(
    (name: string) =>
      mutate((current) => ({
        ...current,
        columns: [...current.columns, name],
        rows: current.rows.map((row) => ({ id: row.id, cells: [...row.cells, ""] })),
      })),
    [mutate],
  );

  const renameColumn = useCallback(
    (from: string, to: string) => {
      mutate((current) => ({ ...current, columns: current.columns.map((name) => (name === from ? to : name)) }));
      const rename = <T>(record: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(record).map(([key, value]) => [key === from ? to : key, value]));
      setSchema(rename(schemaRef.current));
      const renameState = (state: ViewState): ViewState => ({
        ...state,
        filters: rename(state.filters),
        sort: state.sort?.column === from ? { ...state.sort, column: to } : state.sort,
        groupBy: state.groupBy === from ? to : state.groupBy,
        hidden: state.hidden?.map((name) => (name === from ? to : name)),
        phases: state.phases?.map((phase) => ({
          ...phase,
          start: phase.start === from ? to : phase.start,
          end: phase.end === from ? to : phase.end,
        })),
      });
      updateEntry((current) => ({
        ...current,
        state: renameState(current.state),
        views: current.views.map((view) => ({ ...view, state: renameState(view.state) })),
      }));
    },
    [mutate, updateEntry, setSchema],
  );

  const deleteColumn = useCallback(
    (name: string) => {
      mutate((current) => {
        const index = current.columns.indexOf(name);
        if (index < 0) return current;
        return {
          ...current,
          columns: current.columns.toSpliced(index, 1),
          rows: current.rows.map((row) => ({ id: row.id, cells: row.cells.toSpliced(index, 1) })),
        };
      });
      setSchema(Object.fromEntries(Object.entries(schemaRef.current).filter(([key]) => key !== name)));
    },
    [mutate, setSchema],
  );

  /** Moves a column of the CSV to another position. */
  const moveColumn = useCallback(
    (name: string, to: number) =>
      mutate((current) => {
        const from = current.columns.indexOf(name);
        const target = Math.max(0, Math.min(to, current.columns.length - 1));
        if (from < 0 || from === target) return current;
        const move = <T>(list: T[]) => {
          const next = [...list];
          const [item] = next.splice(from, 1);
          next.splice(target, 0, item as T);
          return next;
        };
        return {
          ...current,
          columns: move(current.columns),
          rows: current.rows.map((row) => ({ id: row.id, cells: move(row.cells) })),
        };
      }),
    [mutate],
  );

  /** `table` is already laid out for its own column list, which starts with the existing columns. */
  const importTable = useCallback(
    (table: Table, mode: ImportMode) =>
      mutate((current, live) => {
        const width = table.columns.length;
        const kept =
          mode === "replace"
            ? []
            : toRows(
                current.rows.map((row) => row.cells),
                width,
              );
        kept.forEach((row, i) => {
          row.id = current.rows[i]?.id ?? row.id;
        });
        const added = toRows(table.rows, width, live.nextRowId);
        live.nextRowId += added.length;
        assignIds(table.columns, schemaRef.current, [...kept, ...added], added);
        return { ...current, columns: table.columns, rows: [...kept, ...added] };
      }),
    [mutate],
  );

  // ---- Files -------------------------------------------------------------------------------------------------------

  const register = useCallback(
    async (handle: FileSystemFileHandle) => {
      for (const file of registry.files) {
        const known = await loadHandle(file.id).catch(() => undefined);
        if (known && (await known.isSameEntry(handle))) {
          // Refresh the stored handle: the new one carries the permission just granted.
          await saveHandle(file.id, handle);
          setRegistry((current) => ({ ...current, activeId: file.id }));
          if (file.id === activeId) await read(file.id, handle, () => true);
          return;
        }
      }
      const id = crypto.randomUUID();
      await saveHandle(id, handle);
      setRegistry((current) => ({ files: [...current.files, newEntry(id, handle.name)], activeId: id }));
    },
    [registry.files, activeId, read],
  );

  const openFile = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const handle = await pickCsvFile();
      if (handle) await register(handle);
    } catch (error) {
      toast.error(`Impossible d'ouvrir le fichier : ${message(error)}`);
    }
  }, [register, confirmDiscard]);

  const createFile = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const handle = await createCsvFile();
      if (!handle) return;
      await writeHandle(handle, serializeCsv({ columns: ["Titre"], rows: [], format: DEFAULT_FORMAT }));
      await register(handle);
    } catch (error) {
      toast.error(`Impossible de créer le fichier : ${message(error)}`);
    }
  }, [register, confirmDiscard]);

  /** Points the current entry at a file picked again, keeping its schema and views. */
  const relinkFile = useCallback(async () => {
    if (!activeId) return;
    try {
      const handle = await pickCsvFile();
      if (!handle) return;
      await saveHandle(activeId, handle);
      pending.current = handle;
      updateEntry((current) => ({ ...current, name: handle.name }));
      await read(activeId, handle, () => pending.current === handle);
    } catch (error) {
      toast.error(`Impossible d'ouvrir le fichier : ${message(error)}`);
    }
  }, [activeId, read, updateEntry]);

  const selectFile = useCallback(
    (id: string) => {
      if (id === activeId || !confirmDiscard()) return;
      setRegistry((current) => ({ ...current, activeId: id }));
    },
    [activeId, confirmDiscard],
  );

  const removeFile = useCallback(
    (id: string) => {
      if (id === activeId && !confirmDiscard()) return;
      void deleteHandle(id).catch(() => {});
      setRegistry((current) => {
        const files = current.files.filter((file) => file.id !== id);
        return { files, activeId: current.activeId === id ? files[0]?.id : current.activeId };
      });
    },
    [activeId, confirmDiscard],
  );

  /** Called from a click, after a reload: the browser asks again before giving the file back. */
  const grantAccess = useCallback(async () => {
    const handle = pending.current;
    if (!handle || !activeId) return;
    try {
      if (await requestPermission(handle)) await read(activeId, handle, () => pending.current === handle);
    } catch (error) {
      setStatus("missing");
      toast.error(`Impossible d'ouvrir le fichier : ${message(error)}`);
    }
  }, [activeId, read]);

  // ---- Views -------------------------------------------------------------------------------------------------------

  const setViewState = useCallback(
    (patch: Partial<ViewState>) => updateEntry((current) => ({ ...current, state: { ...current.state, ...patch } })),
    [updateEntry],
  );

  const saveView = useCallback(
    (name: string) => {
      const id = crypto.randomUUID();
      updateEntry((current) => ({
        ...current,
        views: [...current.views, { id, name, state: current.state }],
        activeViewId: id,
      }));
    },
    [updateEntry],
  );

  const updateView = useCallback(
    (id: string) =>
      updateEntry((current) => ({
        ...current,
        views: current.views.map((view) => (view.id === id ? { ...view, state: current.state } : view)),
      })),
    [updateEntry],
  );

  const applyView = useCallback(
    (id: string | undefined) =>
      updateEntry((current) => {
        const view = current.views.find((candidate) => candidate.id === id);
        return { ...current, activeViewId: view?.id, state: view ? view.state : defaultState() };
      }),
    [updateEntry],
  );

  const deleteView = useCallback(
    (id: string) =>
      updateEntry((current) => ({
        ...current,
        views: current.views.filter((view) => view.id !== id),
        activeViewId: current.activeViewId === id ? undefined : current.activeViewId,
      })),
    [updateEntry],
  );

  return {
    files: registry.files,
    entry,
    status,
    data,
    schema,
    dirty,
    saving,
    diskChanged,
    save,
    discard,
    refresh,
    updateCell,
    addRow,
    deleteRow,
    insertRow,
    fillIds,
    setSchema,
    addColumn,
    renameColumn,
    deleteColumn,
    moveColumn,
    importTable,
    openFile,
    createFile,
    relinkFile,
    selectFile,
    removeFile,
    grantAccess,
    setViewState,
    saveView,
    updateView,
    applyView,
    deleteView,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
