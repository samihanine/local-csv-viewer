import { ChevronLeftIcon, ChevronRightIcon, EyeOffIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect } from "react";
import { FieldEditor, TypeIconFor } from "@/components/fields";
import { Button } from "@/components/ui/button";
import type { Row } from "@/lib/csv";
import type { ColumnSchema } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

export const rowTitle = (row: Row, title: number) => row.cells[title]?.trim() || "Sans titre";

/** The form of one row, on the right of any view. */
export function DetailPanel({ row }: { row: Row }) {
  const { columns, display, types, visible, title, selectRow, closeRow, updateCell, setColumnSchema, removeRow } =
    useView();
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
      className="bg-background animate-in slide-in-from-right-4 fade-in-0 flex w-[440px] max-w-[60%] shrink-0 flex-col border-l duration-150 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full max-md:max-w-full max-md:shadow-xl"
    >
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
    </aside>
  );
}
