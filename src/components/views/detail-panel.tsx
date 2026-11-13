import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CornerDownRightIcon,
  EyeOffIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FieldEditor, TypeIconFor } from "@/components/fields";
import { Button } from "@/components/ui/button";
import type { Row } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";
import { rowTitle } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const WIDTH_KEY = "local-csv-viewer:panel-width";
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 440;
const VIEW_MIN = 240;

const savedWidth = () => {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH ? value : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

/** Width of the panel, dragged with the mouse and remembered for the whole app. */
function usePanelWidth() {
  const [width, setWidth] = useState(savedWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  // The view next to the panel keeps at least this much room.
  const max = () => Math.max(MIN_WIDTH, (panel.current?.parentElement?.clientWidth ?? window.innerWidth) - VIEW_MIN);

  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    // The handle is on the left edge: moving left makes the panel wider.
    setWidth(Math.round(Math.min(max(), Math.max(MIN_WIDTH, drag.current.width + drag.current.x - event.clientX))));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    // Saves the width really shown, after the layout has applied its own limits.
    const shown = Math.round(panel.current?.getBoundingClientRect().width ?? width);
    setWidth(shown);
    try {
      localStorage.setItem(WIDTH_KEY, String(shown));
    } catch {}
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const clamped = Math.min(max(), Math.max(MIN_WIDTH, next));
    setWidth(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {}
  };
  return {
    width,
    panel,
    handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  };
}

/** The form of one row, on the right of any view. */
export function DetailPanel({ row }: { row: Row }) {
  const { columns, display, types, visible, rows, title, selectRow, closeRow, updateCell, setColumnSchema, removeRow } =
    useView();
  const { inherited, parentOf, keyColumn, newRow } = useView();
  const { width, panel, handle } = usePanelWidth();
  const flags = inherited.get(row.id);
  const parentColumn = types.findIndex((type) => type.type === "parent");
  const parentId = parentOf.get(row.id);
  const parent = parentId === undefined ? undefined : rows.find((candidate) => candidate.id === parentId);
  const children = rows.filter((candidate) => parentOf.get(candidate.id) === row.id);
  const key = (row.cells[keyColumn] ?? "").trim();
  const position = visible.findIndex((candidate) => candidate.id === row.id);

  const go = (step: number) => {
    const target = visible[position + step];
    if (target) selectRow(target.id);
  };

  // Escape closes the panel, unless a popup inside the page handles it first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=dialog], [role=menu], [role=listbox]")) return;
      closeRow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRow]);

  return (
    <aside
      aria-label="Détail de la ligne"
      ref={panel}
      style={{ width }}
      className="bg-background animate-in slide-in-from-right-4 fade-in-0 relative flex max-w-[calc(100%-240px)] shrink-0 flex-col border-l duration-150 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full! max-md:max-w-full max-md:shadow-xl"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a vertical splitter has no native element */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le détail"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        tabIndex={0}
        {...handle}
        className="group/handle absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none max-md:hidden"
      >
        <span className="group-hover/handle:bg-brand/60 group-focus-visible/handle:bg-brand group-active/handle:bg-brand mx-auto block h-full w-0.5 transition-colors" />
      </div>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        {position < 0 ? (
          <span className="bg-muted text-muted-foreground flex h-7 items-center gap-1.5 rounded-md px-2 text-xs">
            <EyeOffIcon className="size-3.5" /> Hors filtres
          </span>
        ) : (
          <span className="text-muted-foreground px-1 text-xs tabular-nums">
            {position + 1} / {visible.length}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ligne précédente"
          disabled={position <= 0}
          onClick={() => go(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ligne suivante"
          disabled={position < 0 || position >= visible.length - 1}
          onClick={() => go(1)}
        >
          <ChevronRightIcon />
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Supprimer la ligne"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            const next = visible[position + 1] ?? visible[position - 1];
            removeRow(row.id);
            if (next) selectRow(next.id);
            else closeRow();
          }}
        >
          <Trash2Icon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fermer le détail" onClick={closeRow}>
          <XIcon />
        </Button>
      </div>
      <div key={row.id} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {parent && (
          <button
            type="button"
            onClick={() => selectRow(parent.id)}
            className="text-muted-foreground hover:text-foreground mb-1.5 flex max-w-full items-center gap-1 text-xs"
          >
            <ChevronLeftIcon className="size-3.5 shrink-0" />
            <span className="truncate">{rowTitle(parent, title)}</span>
          </button>
        )}
        <h2 className="mb-6 text-xl font-semibold tracking-tight break-words">{rowTitle(row, title)}</h2>
        <div className="space-y-4">
          {display.map((index) => {
            const column = columns[index] ?? "";
            const schema = types[index] as ColumnSchema;
            return (
              <div
                key={column}
                className={cn(
                  "grid gap-1.5",
                  schema.type !== "longtext" && "sm:grid-cols-[8.5rem_1fr] sm:items-center sm:gap-3",
                )}
              >
                <div className="text-muted-foreground flex min-w-0 items-center gap-2">
                  <TypeIconFor type={schema.type} />
                  <span className="truncate font-medium" title={column}>
                    {column}
                  </span>
                  {flags?.[index] && (
                    <span
                      title={parent ? `Valeur de « ${rowTitle(parent, title)} »` : "Valeur du parent"}
                      className="bg-muted shrink-0 rounded px-1 text-[10px] font-medium"
                    >
                      hérité
                    </span>
                  )}
                </div>
                {/* Inherited values are greyed, and become the row's own as soon as they are edited. */}
                <div
                  className={cn(
                    "min-w-0",
                    flags?.[index] && "opacity-55 transition-opacity focus-within:opacity-100 hover:opacity-80",
                  )}
                >
                  <FieldEditor
                    label={column}
                    rowId={row.id}
                    value={row.cells[index] ?? ""}
                    schema={schema}
                    onChange={(value) => updateCell(row.id, index, value)}
                    onSchemaChange={(next) => setColumnSchema(column, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {parentColumn >= 0 && key && (
          <div className="mt-8 border-t pt-5">
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
              Sous-lignes {children.length > 0 && <span className="tabular-nums">· {children.length}</span>}
            </p>
            <div className="space-y-0.5">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => selectRow(child.id)}
                  className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                >
                  <CornerDownRightIcon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{rowTitle(child, title)}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => newRow({ [parentColumn]: key })}
                className="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
              >
                <PlusIcon className="size-3.5 shrink-0" /> Ajouter une sous-ligne
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
