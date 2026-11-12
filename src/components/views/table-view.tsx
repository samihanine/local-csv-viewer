import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  Columns3Icon,
  ListFilterIcon,
  Maximize2Icon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { CellValue, OptionPicker, TypeIconFor } from "@/components/fields";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Row } from "@/lib/csv";
import { isActive } from "@/lib/query";
import {
  COLUMN_TYPES,
  type ColumnSchema,
  type ColumnType,
  formatDate,
  own,
  parseDate,
  TYPE_LABELS,
} from "@/lib/schema";
import { useVirtual } from "@/lib/use-virtual";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const ROW_HEIGHT = 38;
const GUTTER = 64;
const WIDTHS: Record<ColumnType, number> = { text: 220, longtext: 320, date: 150, select: 180 };

type Editing = { id: number; column: number } | null;

const cellClass =
  "flex h-full w-full items-center overflow-hidden px-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/60";

function HeaderCell({ column, index, width }: { column: string; index: number; width: number }) {
  const { types, state, setViewState, setColumnSchema, editFilter, openSchema } = useView();
  const schema = types[index] as ColumnSchema;
  const sorted = state.sort?.column === column ? state.sort : undefined;
  const filtered = isActive(own(state.filters, column), schema.type);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={{ width }}
        className="hover:bg-muted/60 aria-expanded:bg-muted/60 flex h-full shrink-0 items-center gap-2 border-r px-3 text-left outline-none"
      >
        <TypeIconFor type={schema.type} />
        <span className="truncate font-medium">{column}</span>
        {filtered && <ListFilterIcon className="text-brand size-3.5 shrink-0" />}
        {sorted &&
          (sorted.desc ? (
            <ArrowDownIcon className="text-brand size-3.5 shrink-0" />
          ) : (
            <ArrowUpIcon className="text-brand size-3.5 shrink-0" />
          ))}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem onClick={() => setViewState({ sort: { column, desc: false } })}>
          <ArrowUpIcon /> Tri croissant
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setViewState({ sort: { column, desc: true } })}>
          <ArrowDownIcon /> Tri décroissant
        </DropdownMenuItem>
        {sorted && (
          <DropdownMenuItem onClick={() => setViewState({ sort: undefined })}>
            <XIcon /> Retirer le tri
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => editFilter(column)}>
          <ListFilterIcon /> Filtrer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Type de colonne</DropdownMenuLabel>
        {COLUMN_TYPES.map((type) => (
          <DropdownMenuItem key={type} onClick={() => setColumnSchema(column, { ...schema, type })}>
            <TypeIconFor type={type} className="text-foreground" /> {TYPE_LABELS[type]}
            {schema.type === type && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openSchema}>
          <Columns3Icon /> Modifier le schéma…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CellProps = {
  rowId: number;
  column: number;
  value: string;
  schema: ColumnSchema;
  name: string;
  editing: boolean;
  setEditing: (editing: Editing) => void;
};

const Cell = memo(function Cell({ rowId, column, value, schema, name, editing, setEditing }: CellProps) {
  const { updateCell, setColumnSchema, columns } = useView();
  const commit = (next: string) => updateCell(rowId, column, next);
  const me = { id: rowId, column };
  const display = <CellValue value={value} schema={schema} />;

  if (schema.type === "select" || schema.type === "longtext") {
    const long = schema.type === "longtext";
    return (
      <Popover open={editing} onOpenChange={(open) => setEditing(open ? me : null)}>
        <PopoverTrigger className={cn(cellClass, editing && "bg-muted/60 ring-brand ring-2 ring-inset")}>
          {display}
        </PopoverTrigger>
        <PopoverContent sideOffset={2} className={long ? "w-[34rem] max-w-[calc(100vw-2rem)] p-2" : "w-64 p-2"}>
          {long ? (
            <MarkdownEditor value={value} onCommit={commit} autoFocus className="border-0 focus-within:ring-0" />
          ) : (
            <OptionPicker
              schema={schema}
              value={value}
              onSchemaChange={(next) => setColumnSchema(name, next)}
              onPick={(next) => {
                commit(next);
                setEditing(null);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    );
  }

  if (!editing)
    return (
      <button type="button" className={cellClass} onClick={() => setEditing(me)} onFocus={() => setEditing(me)}>
        {display}
      </button>
    );

  const date = schema.type === "date";
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the cell was just clicked
      autoFocus
      type={date ? "date" : "text"}
      aria-label={name}
      defaultValue={date ? (parseDate(value, schema.dateFormat) ?? "") : value}
      className="bg-background ring-brand h-full w-full px-3 ring-2 outline-none ring-inset"
      onBlur={(event) => {
        const raw = event.target.value;
        const next = date ? (raw ? formatDate(raw, schema.dateFormat) : "") : raw;
        // A date cell holding free text is left alone unless a date was picked.
        if (next !== value && !(date && !raw && !parseDate(value, schema.dateFormat))) commit(next);
        setEditing(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = date ? (parseDate(value, schema.dateFormat) ?? "") : value;
          event.currentTarget.blur();
        }
        if (event.key === "Tab") {
          const next = column + (event.shiftKey ? -1 : 1);
          if (next < 0 || next >= columns.length) return;
          event.preventDefault();
          event.currentTarget.blur();
          setEditing({ id: rowId, column: next });
        }
      }}
    />
  );
});

type RowProps = { row: Row; index: number; widths: number[]; editingColumn: number; setEditing: (e: Editing) => void };

const TableRow = memo(function TableRow({ row, index, widths, editingColumn, setEditing }: RowProps) {
  const { columns, types, openRow, removeRow } = useView();
  return (
    <div className="group absolute left-0 flex border-b" style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}>
      <div
        style={{ width: GUTTER }}
        className="bg-background text-muted-foreground sticky left-0 z-10 flex shrink-0 items-center justify-center border-r text-xs tabular-nums"
      >
        <span className="group-focus-within:hidden group-hover:hidden">{index + 1}</span>
        <span className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
          <button
            type="button"
            title="Ouvrir la fiche"
            aria-label={`Ouvrir la ligne ${index + 1}`}
            onClick={() => openRow(row.id)}
            className="hover:bg-muted hover:text-foreground grid size-6 place-items-center rounded-md"
          >
            <Maximize2Icon className="size-3.5" />
          </button>
          <button
            type="button"
            title="Supprimer la ligne"
            aria-label={`Supprimer la ligne ${index + 1}`}
            onClick={() => removeRow(row.id)}
            className="hover:bg-destructive/10 hover:text-destructive grid size-6 place-items-center rounded-md"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </span>
      </div>
      {columns.map((name, column) => (
        <div key={name} style={{ width: widths[column] }} className="shrink-0 border-r">
          <Cell
            rowId={row.id}
            column={column}
            name={name}
            value={row.cells[column] ?? ""}
            schema={types[column] as ColumnSchema}
            editing={editingColumn === column}
            setEditing={setEditing}
          />
        </div>
      ))}
    </div>
  );
});

export function TableView() {
  const { columns, types, visible, rows, createRow, openRow, state } = useView();
  const [editing, setEditing] = useState<Editing>(null);
  const { ref, start, end } = useVirtual(visible.length, ROW_HEIGHT);
  const widths = useMemo(() => types.map((schema) => WIDTHS[schema.type]), [types]);
  const total = GUTTER + widths.reduce((sum, width) => sum + width, 0);
  const narrowed = visible.length !== rows.length || !!state.sort;

  const add = () => {
    const id = createRow();
    if (id === undefined) return;
    // With filters or a sort, the new row may not be at the bottom, or not be listed at all: show its form.
    if (narrowed) return openRow(id);
    setEditing({ id, column: 0 });
    requestAnimationFrame(() => ref.current?.scrollTo({ top: ref.current.scrollHeight }));
  };

  return (
    <div ref={ref} className="h-full overflow-auto">
      <div style={{ width: total }} className="min-w-full">
        <div className="bg-background text-muted-foreground sticky top-0 z-20 flex h-10 border-b">
          <div style={{ width: GUTTER }} className="bg-background sticky left-0 z-10 shrink-0 border-r" />
          {columns.map((column, index) => (
            <HeaderCell key={column} column={column} index={index} width={widths[index] ?? 0} />
          ))}
        </div>
        <div className="relative" style={{ height: visible.length * ROW_HEIGHT }}>
          {visible.slice(start, end).map((row, offset) => (
            <TableRow
              key={row.id}
              row={row}
              index={start + offset}
              widths={widths}
              editingColumn={editing?.id === row.id ? editing.column : -1}
              setEditing={setEditing}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={add}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground sticky left-0 flex h-10 w-full items-center gap-2 px-4 text-left"
        >
          <PlusIcon className="size-4" /> Nouvelle ligne
        </button>
      </div>
    </div>
  );
}
