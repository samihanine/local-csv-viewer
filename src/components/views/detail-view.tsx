import { ChevronLeftIcon, ChevronRightIcon, EyeOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { CellValue, FieldEditor, TypeIconFor } from "@/components/fields";
import { Button } from "@/components/ui/button";
import type { ColumnSchema } from "@/lib/schema";
import { useVirtual } from "@/lib/use-virtual";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const ITEM_HEIGHT = 56;

export const rowTitle = (cells: string[]) => cells[0]?.trim() || "Sans titre";

function RowList({ selectedId }: { selectedId: number | undefined }) {
  const { visible, types, selectRow } = useView();
  const { ref, start, end } = useVirtual(visible.length, ITEM_HEIGHT);
  const subtitle = types[1];

  return (
    <div ref={ref} className="h-full w-72 shrink-0 overflow-y-auto border-r max-lg:w-56 max-md:hidden">
      <div className="relative" style={{ height: visible.length * ITEM_HEIGHT }}>
        {visible.slice(start, end).map((row, offset) => (
          <button
            key={row.id}
            type="button"
            onClick={() => selectRow(row.id)}
            style={{ top: (start + offset) * ITEM_HEIGHT, height: ITEM_HEIGHT }}
            className="absolute inset-x-0 px-2 py-0.5 text-left outline-none"
          >
            <span
              className={cn(
                "hover:bg-muted/60 flex h-full flex-col justify-center gap-0.5 rounded-lg px-3 transition-colors",
                row.id === selectedId && "bg-muted hover:bg-muted",
              )}
            >
              <span className="truncate font-medium">{rowTitle(row.cells)}</span>
              {subtitle && (
                <span className="text-muted-foreground flex h-5 items-center text-xs">
                  <CellValue value={row.cells[1] ?? ""} schema={subtitle} />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
      {!visible.length && <p className="text-muted-foreground p-6 text-center">Aucune ligne</p>}
    </div>
  );
}

export function DetailView() {
  const { columns, types, rows, visible, selectedId, selectRow, updateCell, setColumnSchema, removeRow, newRow } =
    useView();
  const row = rows.find((candidate) => candidate.id === selectedId) ?? visible[0];
  const position = row ? visible.findIndex((candidate) => candidate.id === row.id) : -1;
  const go = (step: number) => {
    const target = visible[position < 0 ? 0 : position + step];
    if (target) selectRow(target.id);
  };

  return (
    <div className="flex h-full">
      <RowList selectedId={row?.id} />
      {row ? (
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div key={row.id} className="mx-auto max-w-3xl px-8 py-8 max-sm:px-4">
            <div className="mb-8 flex items-start gap-3">
              <h2 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">
                {rowTitle(row.cells)}
              </h2>
              <div className="text-muted-foreground flex shrink-0 items-center gap-1">
                {position < 0 ? (
                  <span className="bg-muted mr-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs">
                    <EyeOffIcon className="size-3.5" /> Hors filtres
                  </span>
                ) : (
                  <span className="mr-1 text-xs tabular-nums">
                    {position + 1} / {visible.length}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Ligne précédente"
                  disabled={position <= 0}
                  onClick={() => go(-1)}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Ligne suivante"
                  disabled={position >= visible.length - 1}
                  onClick={() => go(1)}
                >
                  <ChevronRightIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Supprimer la ligne"
                  className="hover:bg-destructive/10 hover:text-destructive ml-1"
                  onClick={() => {
                    const next = visible[position + 1] ?? visible[position - 1];
                    removeRow(row.id);
                    if (next) selectRow(next.id);
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
            <div className="space-y-5">
              {columns.map((column, index) => {
                const schema = types[index] as ColumnSchema;
                return (
                  <div
                    key={column}
                    className={cn(
                      "grid gap-2",
                      schema.type !== "longtext" && "sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-4",
                    )}
                  >
                    <div className="text-muted-foreground flex min-w-0 items-center gap-2">
                      <TypeIconFor type={schema.type} />
                      <span className="truncate font-medium">{column}</span>
                    </div>
                    <FieldEditor
                      label={column}
                      value={row.cells[index] ?? ""}
                      schema={schema}
                      onChange={(value) => updateCell(row.id, index, value)}
                      onSchemaChange={(next) => setColumnSchema(column, next)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4">
          <p>Aucune ligne à afficher</p>
          <Button variant="outline" size="sm" className="h-9 px-3 text-sm" onClick={() => newRow()}>
            <PlusIcon /> Nouvelle ligne
          </Button>
        </div>
      )}
    </div>
  );
}
