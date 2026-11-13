import {
  Columns3Icon,
  FileSpreadsheetIcon,
  GlobeIcon,
  Loader2Icon,
  MoonIcon,
  RotateCwIcon,
  SaveIcon,
  SearchIcon,
  SunIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExcelPage } from "@/components/excel-page";
import { FilterBar } from "@/components/filter-bar";
import { ImportDialog } from "@/components/import-dialog";
import { SchemaDialog } from "@/components/schema-dialog";
import { MODE_META, Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { DetailPanel } from "@/components/views/detail-panel";
import { GalleryView } from "@/components/views/gallery-view";
import { GanttView } from "@/components/views/gantt-view";
import { KanbanView } from "@/components/views/kanban-view";
import { TableView } from "@/components/views/table-view";
import { Loading, Missing, NeedsPermission, Welcome } from "@/components/welcome";
import type { Row } from "@/lib/csv";
import { runQuery } from "@/lib/query";
import { type ColumnSchema, columnSchema, own, titleIndex } from "@/lib/schema";
import { useTheme } from "@/lib/theme";
import { keyIndex, resolveTree } from "@/lib/tree";
import { initialHash, onHashChange, type Page, updateHash } from "@/lib/url-state";
import { useWorkspace } from "@/lib/use-workspace";
import { baseName, cn, downloadBlob, formatNumber } from "@/lib/utils";
import { type ViewContext, ViewProvider } from "@/lib/view-context";
import { defaultState, displayColumns, MODES, sameState, type ViewState } from "@/lib/workspace-store";
import { exportXlsx, XLSX_MAX_ROWS } from "@/lib/xlsx";

const NO_COLUMNS: string[] = [];
const NO_ROWS: Row[] = [];
const DEFAULT_STATE: ViewState = defaultState();

const VIEWS = { table: TableView, kanban: KanbanView, gallery: GalleryView, gantt: GanttView };

const PAGE_KEY = "local-csv-viewer:page";

const PAGES: { page: Page; label: string; icon: typeof FileSpreadsheetIcon; className: string }[] = [
  {
    page: "csv",
    label: "Fichiers CSV",
    icon: FileSpreadsheetIcon,
    className: "from-brand shadow-brand/30 to-[oklch(0.55_0.2_265)]",
  },
  {
    page: "excel",
    label: "Lecteur Excel",
    icon: GlobeIcon,
    className: "from-[oklch(0.72_0.17_155)] shadow-[oklch(0.65_0.17_155)]/30 to-[oklch(0.58_0.15_160)]",
  },
];

function Rail({ page, onPage }: { page: Page; onPage: (page: Page) => void }) {
  const { theme, toggle } = useTheme();
  return (
    <nav aria-label="Outils" className="flex w-12 shrink-0 flex-col items-center gap-3 py-2 max-sm:hidden">
      {PAGES.map(({ page: target, label, icon: Icon, className }) => {
        const active = page === target;
        return (
          <button
            key={target}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => onPage(target)}
            className={cn(
              "focus-visible:ring-ring/50 grid size-10 place-items-center rounded-xl bg-linear-to-b text-white shadow-md transition-all outline-none focus-visible:ring-3",
              className,
              active
                ? "ring-foreground/15 ring-offset-app ring-2 ring-offset-2"
                : "opacity-60 saturate-50 hover:opacity-100 hover:saturate-100",
            )}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
        className="text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-ring/50 mt-auto grid size-10 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-3"
      >
        {theme === "dark" ? <SunIcon className="size-[18px]" /> : <MoonIcon className="size-[18px]" />}
      </button>
    </nav>
  );
}

/** The tool named in the address wins; otherwise the last one used. */
const initialPage = (): Page => {
  if (initialHash.page) return initialHash.page;
  try {
    return localStorage.getItem(PAGE_KEY) === "excel" ? "excel" : "csv";
  } catch {
    return "csv";
  }
};

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  useEffect(() => updateHash({ page }), [page]);
  useEffect(() => onHashChange((address) => address.page && setPage(address.page)), []);
  const choose = (next: Page) => {
    setPage(next);
    try {
      localStorage.setItem(PAGE_KEY, next);
    } catch {}
  };
  return (
    <div className="flex h-full gap-2 p-2">
      <Rail page={page} onPage={choose} />
      {/* Both tools stay mounted while hidden: unsaved changes and the open Excel survive a switch. */}
      <CsvWorkspace hidden={page !== "csv"} />
      <ExcelPage hidden={page !== "excel"} />
      <Toaster position="bottom-right" />
    </div>
  );
}

function CsvWorkspace({ hidden }: { hidden: boolean }) {
  const workspace = useWorkspace();
  const { entry, data, status } = workspace;
  const [selectedId, setSelectedId] = useState<number>();
  const [openFilter, setOpenFilter] = useState<string>();
  const [dialog, setDialog] = useState<"schema" | "import">();

  const ready = status === "ready" && !!data && !!entry;
  const columns = data?.columns ?? NO_COLUMNS;
  /** Rows as in the file, used to undo a deletion. */
  const rawRows = data?.rows ?? NO_ROWS;
  const { schema, dirty, saving, save, discard, refresh, diskChanged } = workspace;
  const state = entry?.state ?? DEFAULT_STATE;
  const { setViewState, setSchema, updateCell, addRow, deleteRow, insertRow } = workspace;

  // The panel shows nothing of another file.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the file changes
  useEffect(() => setSelectedId(undefined), [entry?.id]);

  // Ctrl+S / Cmd+S saves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        // Lets a field being edited commit its value first.
        setTimeout(() => void save(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const types = useMemo(() => columns.map((column) => columnSchema(schema, column)), [columns, schema]);
  const display = useMemo(() => displayColumns(columns, state), [columns, state]);
  const title = useMemo(() => titleIndex(columns, schema), [columns, schema]);
  // Children show the values of their parent in their empty cells; views, filters and the export see them too.
  const tree = useMemo(() => resolveTree(rawRows, types, title), [rawRows, types, title]);
  const rows = tree.rows;
  const keyColumn = keyIndex(types, title);
  const search = useDeferredValue(state.search);
  const visible = useMemo(
    () => runQuery(columns, tree.rows, schema, { search, filters: state.filters, sort: state.sort }),
    [columns, tree.rows, schema, search, state.filters, state.sort],
  );

  const openRow = useCallback(
    (rowId: number) => setSelectedId((current) => (current === rowId ? undefined : rowId)),
    [],
  );
  const closeRow = useCallback(() => setSelectedId(undefined), []);

  const removeRow = useCallback(
    (rowId: number) => {
      const index = rawRows.findIndex((row) => row.id === rowId);
      const row = rawRows[index];
      if (!row) return;
      deleteRow(rowId);
      toast("Ligne supprimée", { action: { label: "Annuler", onClick: () => insertRow(row, index) } });
    },
    [rawRows, deleteRow, insertRow],
  );

  const view = useMemo<ViewContext>(
    () => ({
      columns,
      types,
      title,
      display,
      rows,
      visible,
      state,
      inherited: tree.inherited,
      parentOf: tree.parentOf,
      byKey: tree.byKey,
      keyColumn,
      selectedId,
      setViewState,
      updateCell,
      setColumnSchema: (column: string, next: ColumnSchema) => setSchema({ ...schema, [column]: next }),
      createRow: addRow,
      newRow: (values) => {
        const id = addRow(values);
        if (id !== undefined) setSelectedId(id);
      },
      removeRow,
      openRow,
      selectRow: setSelectedId,
      closeRow,
      editFilter: (column: string) => {
        if (!own(state.filters, column)) setViewState({ filters: { ...state.filters, [column]: {} } });
        setOpenFilter(column);
      },
      openSchema: () => setDialog("schema"),
    }),
    [
      columns,
      types,
      title,
      display,
      rows,
      visible,
      state,
      tree,
      keyColumn,
      selectedId,
      schema,
      setViewState,
      updateCell,
      setSchema,
      addRow,
      removeRow,
      openRow,
      closeRow,
    ],
  );

  const activeView = entry?.views.find((candidate) => candidate.id === entry.activeViewId);
  const selectedRow = selectedId === undefined ? undefined : rows.find((row) => row.id === selectedId);
  const View = VIEWS[state.mode] ?? TableView;

  const exportFile = () => {
    if (!entry) return;
    downloadBlob(exportXlsx(columns, rows, schema), `${baseName(entry.name)}.xlsx`);
    if (rows.length > XLSX_MAX_ROWS)
      toast.warning("Excel est limité à 1 048 575 lignes : les suivantes n'ont pas été exportées.");
    else toast.success("Fichier XLSX téléchargé");
  };

  return (
    <div
      className={cn(
        "bg-background flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm",
        hidden && "hidden",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-6 max-sm:px-4">
        <p className="flex min-w-0 items-center gap-2 text-[15px]">
          <span className="text-muted-foreground max-sm:hidden">Fichiers</span>
          <span className="text-muted-foreground max-sm:hidden">/</span>
          <span className="truncate font-medium">{entry?.name ?? "Aucun fichier"}</span>
        </p>
        {ready && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refresh()}
              title="Relire le fichier depuis le disque"
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors outline-none focus-visible:ring-3",
                diskChanged && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              <RotateCwIcon className="size-3.5" />
              <span className={cn(!diskChanged && "max-lg:hidden")}>
                {diskChanged ? "Modifié sur le disque · Recharger" : "Recharger"}
              </span>
            </button>
            {dirty && (
              <>
                <span className="bg-border mx-1 h-5 w-px max-sm:hidden" />
                <span className="flex items-center gap-1.5 text-xs text-amber-700 max-md:hidden dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500" /> Modifications non enregistrées
                </span>
                <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={discard} disabled={saving}>
                  <Undo2Icon /> Annuler
                </Button>
                <Button size="sm" className="h-8 px-3 text-[13px]" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
                  <kbd className="ml-1 hidden rounded bg-white/15 px-1 font-sans text-[10px] lg:inline">Ctrl S</kbd>
                </Button>
              </>
            )}
          </div>
        )}
        {ready && (
          <div className="relative ml-auto w-72 max-w-[45%]">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Rechercher dans toutes les colonnes"
              placeholder="Rechercher…"
              value={state.search}
              onChange={(event) => setViewState({ search: event.target.value })}
              className="bg-muted/60 placeholder:text-muted-foreground focus:bg-background focus:border-ring focus:ring-ring/50 h-9 w-full rounded-xl border border-transparent pr-8 pl-9 transition-colors outline-none focus:ring-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {state.search && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setViewState({ search: "" })}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {status !== "idle" && (
          <Sidebar
            files={workspace.files}
            activeId={entry?.id}
            onSelect={workspace.selectFile}
            onOpen={workspace.openFile}
            onCreate={workspace.createFile}
            onRemove={workspace.removeFile}
            entry={entry}
            ready={ready}
            rowCount={rows.length}
            onNewRow={() => view.newRow()}
            onApplyView={workspace.applyView}
            onDeleteView={workspace.deleteView}
            onSchema={() => setDialog("schema")}
            onImport={() => setDialog("import")}
            onExport={exportFile}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {status === "idle" && <Welcome onOpen={workspace.openFile} onCreate={workspace.createFile} />}
          {status === "loading" && <Loading />}
          {status === "permission" && entry && <NeedsPermission name={entry.name} onGrant={workspace.grantAccess} />}
          {status === "missing" && entry && (
            <Missing name={entry.name} onOpen={workspace.relinkFile} onRemove={() => workspace.removeFile(entry.id)} />
          )}
          {ready && (
            <ViewProvider value={view}>
              <div className="flex shrink-0 items-end gap-6 border-b px-6 max-sm:px-4">
                <div role="tablist" aria-label="Mode d'affichage" className="flex gap-1">
                  {MODES.map((mode) => {
                    const { label, icon: Icon } = MODE_META[mode];
                    const active = state.mode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setViewState({ mode })}
                        className={cn(
                          "text-muted-foreground hover:text-foreground focus-visible:text-foreground relative flex h-12 items-center gap-2 px-3 font-medium transition-colors outline-none",
                          active &&
                            "text-foreground after:bg-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
                        )}
                      >
                        <Icon className="size-4" /> {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-muted-foreground ml-auto flex h-12 items-center text-[13px] tabular-nums">
                  {visible.length === rows.length
                    ? `${formatNumber(rows.length)} ligne${rows.length > 1 ? "s" : ""}`
                    : `${formatNumber(visible.length)} sur ${formatNumber(rows.length)} lignes`}
                </p>
              </div>
              <FilterBar
                open={openFilter}
                onOpenChange={setOpenFilter}
                activeView={activeView}
                dirty={!!activeView && !sameState(activeView.state, state)}
                onSaveView={workspace.saveView}
                onUpdateView={() => activeView && workspace.updateView(activeView.id)}
              />
              <div className="relative flex min-h-0 flex-1">
                {columns.length ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <View />
                    </div>
                    {selectedRow && <DetailPanel row={selectedRow} />}
                  </>
                ) : (
                  <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 text-center">
                    <p className="text-muted-foreground">
                      Ce fichier est vide : commencez par lui ajouter des colonnes.
                    </p>
                    <Button variant="outline" onClick={() => setDialog("schema")}>
                      <Columns3Icon /> Ajouter des colonnes
                    </Button>
                  </div>
                )}
              </div>
              <SchemaDialog
                open={dialog === "schema"}
                onOpenChange={(open) => setDialog(open ? "schema" : undefined)}
                fileName={entry.name}
                data={data}
                schema={schema}
                onSchemaChange={setSchema}
                onAddColumn={workspace.addColumn}
                onRenameColumn={workspace.renameColumn}
                onDeleteColumn={workspace.deleteColumn}
                onMoveColumn={workspace.moveColumn}
                onFillIds={workspace.fillIds}
              />
              <ImportDialog
                open={dialog === "import"}
                onOpenChange={(open) => setDialog(open ? "import" : undefined)}
                columns={columns}
                rowCount={rows.length}
                schema={schema}
                onImport={workspace.importTable}
              />
            </ViewProvider>
          )}
        </main>
      </div>
    </div>
  );
}
