import { PlusIcon, SquareKanbanIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { OptionBadge, optionColor, SimpleSelect } from "@/components/fields";
import { CardContent } from "@/components/views/cards";
import type { Row } from "@/lib/csv";
import { type ColumnSchema, sortOptions } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const MAX_GROUPS = 40;
const PAGE = 100;
const DRAG_TYPE = "application/x-row-id";

/** The column used when the view has none: the first one holding options. */
export const defaultGroupBy = (columns: string[], types: ColumnSchema[]) =>
  columns.find((_, index) => types[index]?.type === "select");

type Group = { value: string; rows: Row[] };

function Lane({ group, schema, column }: { group: Group; schema: ColumnSchema; column: number }) {
  const { openRow, newRow, updateCell } = useView();
  const [over, setOver] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  return (
    <section
      aria-label={group.value || "Sans valeur"}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id = Number(event.dataTransfer.getData(DRAG_TYPE));
        if (Number.isInteger(id)) updateCell(id, column, group.value);
      }}
      className={cn(
        "bg-muted/50 flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-transparent transition-colors",
        over && "border-brand bg-brand/5",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {group.value ? (
          <OptionBadge value={group.value} color={optionColor(schema, group.value)} />
        ) : (
          <span className="text-muted-foreground font-medium">Sans valeur</span>
        )}
        <span className="text-muted-foreground text-xs tabular-nums">{group.rows.length}</span>
        <button
          type="button"
          aria-label={`Ajouter une ligne dans ${group.value || "Sans valeur"}`}
          onClick={() => newRow({ [column]: group.value })}
          className="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto grid size-6 place-items-center rounded-md"
        >
          <PlusIcon className="size-4" />
        </button>
      </header>
      <div className="flex min-h-12 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {group.rows.slice(0, limit).map((row) => (
          <button
            key={row.id}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, String(row.id));
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => openRow(row.id)}
            className="bg-card hover:border-foreground/20 focus-visible:ring-ring/50 flex cursor-grab flex-col gap-1.5 rounded-lg border p-3 text-left shadow-xs transition-all outline-none hover:shadow-sm focus-visible:ring-3 active:cursor-grabbing"
          >
            <CardContent row={row} hidden={column} />
          </button>
        ))}
        {group.rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit(limit + PAGE)}
            className="text-muted-foreground hover:text-foreground py-1 text-xs"
          >
            Afficher plus ({group.rows.length - limit})
          </button>
        )}
      </div>
    </section>
  );
}

export function KanbanView() {
  const { columns, types, visible, state, setViewState } = useView();
  const groupBy = state.groupBy && columns.includes(state.groupBy) ? state.groupBy : defaultGroupBy(columns, types);
  const column = groupBy ? columns.indexOf(groupBy) : -1;
  const schema = types[column];

  const groups = useMemo(() => {
    if (!schema) return [];
    const byValue = new Map<string, Row[]>(sortOptions(schema.options ?? []).map((option) => [option.value, []]));
    const empty: Row[] = [];
    for (const row of visible) {
      const value = row.cells[column] ?? "";
      if (!value) empty.push(row);
      else if (byValue.has(value)) byValue.get(value)?.push(row);
      else byValue.set(value, [row]);
    }
    return [...[...byValue].map(([value, rows]): Group => ({ value, rows })), { value: "", rows: empty }];
  }, [visible, column, schema]);

  if (!schema || groups.length > MAX_GROUPS + 1)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-muted grid size-12 place-items-center rounded-xl">
          <SquareKanbanIcon className="text-muted-foreground size-6" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">
            {schema ? `« ${groupBy} » contient trop de valeurs différentes` : "Choisissez la colonne de regroupement"}
          </p>
          <p className="text-muted-foreground max-w-sm">
            Le kanban crée une colonne par valeur. Les colonnes de type « Options » s'y prêtent le mieux.
          </p>
        </div>
        <SimpleSelect
          aria-label="Grouper par"
          value={schema ? (groupBy ?? "") : ""}
          onChange={(value) => setViewState({ groupBy: value })}
          options={[
            ...(schema ? [] : [{ value: "", label: "Choisir une colonne…" }]),
            ...columns.map((name) => ({ value: name, label: name })),
          ]}
          className="min-w-52"
        />
      </div>
    );

  return (
    <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
      {groups.map((group) => (
        <Lane key={group.value} group={group} schema={schema} column={column} />
      ))}
    </div>
  );
}
