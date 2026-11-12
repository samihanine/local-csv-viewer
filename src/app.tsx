import {
  CircleAlertIcon,
  CircleCheckIcon,
  Columns3Icon,
  FileSpreadsheetIcon,
  Loader2Icon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterBar } from "@/components/filter-bar";
import { ImportDialog } from "@/components/import-dialog";
import { SchemaDialog } from "@/components/schema-dialog";
import { MODE_META, Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { DetailView } from "@/components/views/detail-view";
import { GalleryView } from "@/components/views/gallery-view";
import { KanbanView } from "@/components/views/kanban-view";
import { TableView } from "@/components/views/table-view";
import { Loading, Missing, NeedsPermission, Welcome } from "@/components/welcome";
import type { Row } from "@/lib/csv";
import { runQuery } from "@/lib/query";
import { type ColumnSchema, columnSchema, own, type Schema } from "@/lib/schema";
import { useTheme } from "@/lib/theme";
import { type SaveState, useWorkspace } from "@/lib/use-workspace";
import { baseName, cn, downloadBlob, formatNumber } from "@/lib/utils";
import { type ViewContext, ViewProvider } from "@/lib/view-context";
import { defaultState, displayColumns, MODES, sameState, type ViewState } from "@/lib/workspace-store";
import { exportXlsx, XLSX_MAX_ROWS } from "@/lib/xlsx";

const NO_COLUMNS: string[] = [];
const NO_ROWS: Row[] = [];
const NO_SCHEMA: Schema = {};
const DEFAULT_STATE: ViewState = defaultState();

const VIEWS = { table: TableView, detail: DetailView, kanban: KanbanView, gallery: GalleryView };

const SAVE_META: Record<SaveState, { label: string; icon: typeof CircleCheckIcon; className: string }> = {
  saved: { label: "Enregistré dans le fichier", icon: CircleCheckIcon, className: "text-muted-foreground" },
  saving: { label: "Enregistrement…", icon: Loader2Icon, className: "text-muted-foreground [&_svg]:animate-spin" },
  error: { label: "Échec de l'écriture", icon: CircleAlertIcon, className: "text-destructive" },
};

function Rail() {
  const { theme, toggle } = useTheme();
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-3 py-2 max-sm:hidden">
      <div
        title="Local CSV Viewer"
        className="from-brand shadow-brand/30 grid size-10 place-items-center rounded-xl bg-linear-to-b to-[oklch(0.55_0.2_265)] text-white shadow-md"
      >
        <FileSpreadsheetIcon className="size-5" />
      </div>
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

export function App() {
  const workspace = useWorkspace();
  const { entry, data, status } = workspace;
  const [selectedId, setSelectedId] = useState<number>();
  const [openFilter, setOpenFilter] = useState<string>();
  const [dialog, setDialog] = useState<"schema" | "import">();

  const ready = status === "ready" && !!data && !!entry;
  const columns = data?.columns ?? NO_COLUMNS;
  const rows = data?.rows ?? NO_ROWS;
  const schema = entry?.schema ?? NO_SCHEMA;
  const state = entry?.state ?? DEFAULT_STATE;
  const { setViewState, setSchema, updateCell, addRow, deleteRow, insertRow } = workspace;

  const types = useMemo(() => columns.map((column) => columnSchema(schema, column)), [columns, schema]);
  const display = useMemo(() => displayColumns(columns, state), [columns, state]);
  const search = useDeferredValue(state.search);
  const visible = useMemo(
    () => runQuery(columns, rows, schema, { search, filters: state.filters, sort: state.sort }),
    [columns, rows, schema, search, state.filters, state.sort],
  );

  const openRow = useCallback(
    (rowId: number) => {
      setSelectedId(rowId);
      setViewState({ mode: "detail" });
    },
    [setViewState],
  );

  const removeRow = useCallback(
    (rowId: number) => {
      const index = rows.findIndex((row) => row.id === rowId);
      const row = rows[index];
      if (!row) return;
      deleteRow(rowId);
      toast("Ligne supprimée du fichier", { action: { label: "Annuler", onClick: () => insertRow(row, index) } });
    },
    [rows, deleteRow, insertRow],
  );

  const view = useMemo<ViewContext>(
    () => ({
      columns,
      types,
      display,
      rows,
      visible,
      state,
      selectedId,
      setViewState,
      updateCell,
      setColumnSchema: (column: string, next: ColumnSchema) => setSchema({ ...schema, [column]: next }),
      createRow: addRow,
      newRow: (values) => {
        const id = addRow(values);
        if (id !== undefined) openRow(id);
      },
      removeRow,
      openRow,
      selectRow: setSelectedId,
      editFilter: (column: string) => {
        if (!own(state.filters, column)) setViewState({ filters: { ...state.filters, [column]: {} } });
        setOpenFilter(column);
      },
      openSchema: () => setDialog("schema"),
    }),
    [
      columns,
      types,
      display,
      rows,
      visible,
      state,
      selectedId,
      schema,
      setViewState,
      updateCell,
      setSchema,
      addRow,
      removeRow,
      openRow,
    ],
  );

  const activeView = entry?.views.find((candidate) => candidate.id === entry.activeViewId);
  const save = SAVE_META[workspace.saveState];
  const View = VIEWS[state.mode] ?? TableView;

  const exportFile = () => {
    if (!entry) return;
    downloadBlob(exportXlsx(columns, rows, schema), `${baseName(entry.name)}.xlsx`);
    if (rows.length > XLSX_MAX_ROWS)
      toast.warning("Excel est limité à 1 048 575 lignes : les suivantes n'ont pas été exportées.");
    else toast.success("Fichier XLSX téléchargé");
  };

  return (
    <div className="flex h-full gap-2 p-2">
      <Rail />
      <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-6 max-sm:px-4">
          <p className="flex min-w-0 items-center gap-2 text-[15px]">
            <span className="text-muted-foreground max-sm:hidden">Fichiers</span>
            <span className="text-muted-foreground max-sm:hidden">/</span>
            <span className="truncate font-medium">{entry?.name ?? "Aucun fichier"}</span>
          </p>
          {ready && (
            <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", save.className)} role="status">
              <save.icon className="size-3.5" />
              <span className="max-lg:hidden">{save.label}</span>
            </span>
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
              <Missing
                name={entry.name}
                onOpen={workspace.relinkFile}
                onRemove={() => workspace.removeFile(entry.id)}
              />
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
                <div className="min-h-0 flex-1">
                  {columns.length ? (
                    <View />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
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
        <Toaster position="bottom-right" />
      </div>
    </div>
  );
}
