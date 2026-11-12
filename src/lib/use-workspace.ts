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
import type { Schema } from "@/lib/schema";
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
export type SaveState = "saved" | "saving" | "error";

/** The open file. `data` is the optimistic truth: the UI reads it, the disk catches up. */
type Session = {
  id: string;
  handle: FileSystemFileHandle;
  data: Dataset;
  modified: number;
  nextId: number;
  dirty: boolean;
  writing: boolean;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const WATCH_INTERVAL = 2000;

export function useWorkspace() {
  const [registry, setRegistry] = useState<Registry>(loadRegistry);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<Dataset>();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const session = useRef<Session | undefined>(undefined);
  const pending = useRef<FileSystemFileHandle | undefined>(undefined);

  useEffect(() => saveRegistry(registry), [registry]);

  const { activeId } = registry;
  const entry = useMemo(() => registry.files.find((file) => file.id === activeId), [registry.files, activeId]);

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
    session.current = {
      id,
      handle,
      data: parsed,
      modified,
      nextId: parsed.rows.length,
      dirty: false,
      writing: false,
    };
    setData(parsed);
    setSaveState("saved");
    setStatus("ready");
  }, []);

  useEffect(() => {
    let stale = false;
    session.current = undefined;
    pending.current = undefined;
    setData(undefined);
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

  const reload = useCallback(
    async (current: Session) => {
      await read(current.id, current.handle, () => session.current === current);
    },
    [read],
  );

  // Picks up changes made to the file by another program.
  useEffect(() => {
    const check = async () => {
      const current = session.current;
      if (!current || current.writing || current.dirty || document.hidden) return;
      const modified = await lastModified(current.handle).catch(() => undefined);
      if (modified === undefined || modified === current.modified) return;
      if (session.current !== current || current.writing || current.dirty) return;
      await reload(current).catch(() => {});
      toast.info("Le fichier a changé sur le disque, il a été rechargé.");
    };
    const timer = setInterval(check, WATCH_INTERVAL);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [reload]);

  // ---- Writing -----------------------------------------------------------------------------------------------------

  /** Writes the latest data. Edits made while a write is running are coalesced into the next one. */
  const flush = useCallback(
    async (current: Session) => {
      if (current.writing) return;
      current.writing = true;
      const isCurrent = () => session.current === current;
      if (isCurrent()) setSaveState("saving");
      try {
        while (current.dirty) {
          current.dirty = false;
          current.modified = await writeHandle(current.handle, serializeCsv(current.data));
        }
        if (isCurrent()) setSaveState("saved");
      } catch (error) {
        current.dirty = false;
        if (!isCurrent()) return;
        setSaveState("error");
        toast.error(`Écriture impossible, modification annulée : ${message(error)}`);
        // Roll the optimistic state back to what is really on disk.
        current.writing = false;
        await reload(current).catch(() => setStatus("permission"));
      } finally {
        current.writing = false;
      }
    },
    [reload],
  );

  const mutate = useCallback(
    (change: (data: Dataset, current: Session) => Dataset) => {
      const current = session.current;
      if (!current) return;
      current.data = change(current.data, current);
      current.dirty = true;
      setData(current.data);
      void flush(current);
    },
    [flush],
  );

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
        id = live.nextId++;
        const cells = current.columns.map((_, i) => values[i] ?? "");
        return { ...current, rows: [...current.rows, { id, cells }] };
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

  // ---- Columns -----------------------------------------------------------------------------------------------------

  const setSchema = useCallback((schema: Schema) => updateEntry((current) => ({ ...current, schema })), [updateEntry]);

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
      const renameState = (state: ViewState): ViewState => ({
        ...state,
        filters: rename(state.filters),
        sort: state.sort?.column === from ? { ...state.sort, column: to } : state.sort,
        groupBy: state.groupBy === from ? to : state.groupBy,
      });
      updateEntry((current) => ({
        ...current,
        schema: rename(current.schema),
        state: renameState(current.state),
        views: current.views.map((view) => ({ ...view, state: renameState(view.state) })),
      }));
    },
    [mutate, updateEntry],
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
      updateEntry((current) => ({
        ...current,
        schema: Object.fromEntries(Object.entries(current.schema).filter(([key]) => key !== name)),
      }));
    },
    [mutate, updateEntry],
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
        const added = toRows(table.rows, width, live.nextId);
        live.nextId += added.length;
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
    try {
      const handle = await pickCsvFile();
      if (handle) await register(handle);
    } catch (error) {
      toast.error(`Impossible d'ouvrir le fichier : ${message(error)}`);
    }
  }, [register]);

  const createFile = useCallback(async () => {
    try {
      const handle = await createCsvFile();
      if (!handle) return;
      await writeHandle(handle, serializeCsv({ columns: ["Titre"], rows: [], format: DEFAULT_FORMAT }));
      await register(handle);
    } catch (error) {
      toast.error(`Impossible de créer le fichier : ${message(error)}`);
    }
  }, [register]);

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

  const selectFile = useCallback((id: string) => setRegistry((current) => ({ ...current, activeId: id })), []);

  const removeFile = useCallback((id: string) => {
    void deleteHandle(id).catch(() => {});
    setRegistry((current) => {
      const files = current.files.filter((file) => file.id !== id);
      return { files, activeId: current.activeId === id ? files[0]?.id : current.activeId };
    });
  }, []);

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
    saveState,
    updateCell,
    addRow,
    deleteRow,
    insertRow,
    setSchema,
    addColumn,
    renameColumn,
    deleteColumn,
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
