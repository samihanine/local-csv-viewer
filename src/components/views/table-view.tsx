import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  Columns3Icon,
  CornerDownRightIcon,
  EyeOffIcon,
  ListFilterIcon,
  Maximize2Icon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useColumnLayout } from "@/components/columns-menu";
import { CellValue, OptionPicker, TypeIconFor } from "@/components/fields";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ParentPicker } from "@/components/parent-field";
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
import { treeOrder } from "@/lib/tree";
import { useVirtual } from "@/lib/use-virtual";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const ROW_HEIGHT = 38;
const GUTTER = 64;
const WIDTHS: Record<ColumnType, number> = { id: 110, parent: 170, text: 220, longtext: 640, date: 150, select: 180 };

type Editing = { id: number; column: number } | null;

const cellClass =
  "flex h-full w-full items-center overflow-hidden px-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/60";

function HeaderCell({ column, index, width }: { column: string; index: number; width: number }) {
  const { types, state, title, setViewState, setColumnSchema, editFilter, openSchema } = useView();
  const layout = useColumnLayout();
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
        {index === title && <StarIcon aria-label="Titre" className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
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
        <DropdownMenuItem disabled={!layout.canHide(column)} onClick={() => layout.toggle(column)}>
          <EyeOffIcon /> Masquer la colonne
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
  /** The value comes from the parent row: shown greyed, still editable. */
  inherited?: boolean;
};

const Cell = memo(function Cell({ rowId, column, value, schema, name, editing, setEditing, inherited }: CellProps) {
  const { updateCell, setColumnSchema, display: shown, title } = useView();
  const bold = column === title && "font-semibold";
  const commit = (next: string) => updateCell(rowId, column, next);
  const me = { id: rowId, column };
  const display = (
    <span className={cn("flex min-w-0", inherited && "opacity-50")} title={inherited ? "Hérité du parent" : undefined}>
      <CellValue value={value} schema={schema} />
    </span>
  );

  // Identifiers are given by the app, they are not edited by hand.
  if (schema.type === "id") return <div className={cn(cellClass, "hover:bg-transparent", bold)}>{display}</div>;

  if (schema.type === "parent")
    return (
      <Popover open={editing} onOpenChange={(open) => setEditing(open ? me : null)}>
        <PopoverTrigger className={cn(cellClass, editing && "bg-muted/60 ring-brand ring-2 ring-inset")}>
          {display}
        </PopoverTrigger>
        <PopoverContent sideOffset={2} className="w-80 p-2">
          <ParentPicker
            rowId={rowId}
            value={value}
            onPick={(next) => {
              commit(next);
              setEditing(null);
            }}
          />
        </PopoverContent>
      </Popover>
    );

  if (schema.type === "select" || schema.type === "longtext") {
    const long = schema.type === "longtext";
    return (
      <Popover open={editing} onOpenChange={(open) => setEditing(open ? me : null)}>
        <PopoverTrigger className={cn(cellClass, bold, editing && "bg-muted/60 ring-brand ring-2 ring-inset")}>
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
      <button
        type="button"
        className={cn(cellClass, bold)}
        onClick={() => setEditing(me)}
        onFocus={() => setEditing(me)}
      >
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
      className={cn("bg-background ring-brand h-full w-full px-3 ring-2 outline-none ring-inset", bold)}
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
          const next = shown[shown.indexOf(column) + (event.shiftKey ? -1 : 1)];
          if (next === undefined) return;
          event.preventDefault();
          event.currentTarget.blur();
          setEditing({ id: rowId, column: next });
        }
      }}
    />
  );
});

type RowProps = {
  row: Row;
  index: number;
  widths: number[];
  editingColumn: number;
  setEditing: (e: Editing) => void;
  /** Level in the parent tree: 0 for a row without a (visible) parent. */
  depth: number;
  /** Undefined for a row without children. */
  collapsed?: boolean;
  onToggle: (rowId: number) => void;
};

const INDENT = 20;

const TableRow = memo(function TableRow(props: RowProps) {
  const { row, index, widths, editingColumn, setEditing, depth, collapsed, onToggle } = props;
  const { columns, types, display, selectedId, openRow, removeRow, inherited, title, parentOf } = useView();
  const flags = inherited.get(row.id);
  const tree = depth > 0 || collapsed !== undefined || parentOf.size > 0;
  const selected = row.id === selectedId;
  return (
    <div
      className={cn("group absolute left-0 flex border-b", selected && "bg-brand/[0.06]")}
      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
    >
      <div
        style={{ width: GUTTER }}
        className={cn(
          "bg-background text-muted-foreground sticky left-0 z-10 flex shrink-0 items-center justify-center border-r text-xs tabular-nums",
          selected && "shadow-[inset_3px_0_0_var(--brand)]",
        )}
      >
        <span className="group-focus-within:hidden group-hover:hidden">{index + 1}</span>
        <span className="hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
          <button
            type="button"
            title={selected ? "Fermer la fiche" : "Ouvrir la fiche"}
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
      {display.map((column) => (
        <div key={columns[column]} style={{ width: widths[column] }} className="flex shrink-0 border-r">
          {/* Sub-rows are shifted right under their parent, in the title column. */}
          {column === title && tree && (
            <div className="flex shrink-0 items-center justify-end" style={{ width: depth * INDENT + 24 }}>
              {collapsed !== undefined ? (
                <button
                  type="button"
                  aria-label={collapsed ? "Afficher les sous-lignes" : "Masquer les sous-lignes"}
                  aria-expanded={!collapsed}
                  onClick={() => onToggle(row.id)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-5 place-items-center rounded"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} />
                </button>
              ) : (
                depth > 0 && <CornerDownRightIcon className="text-muted-foreground/50 mr-1 size-3" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Cell
              rowId={row.id}
              column={column}
              name={columns[column] ?? ""}
              value={row.cells[column] ?? ""}
              schema={types[column] as ColumnSchema}
              editing={editingColumn === column}
              setEditing={setEditing}
              inherited={!!flags?.[column]}
            />
          </div>
        </div>
      ))}
    </div>
  );
});

export function TableView() {
  const { columns, types, display, visible, rows, createRow, selectRow, state, title, parentOf } = useView();
  const [editing, setEditing] = useState<Editing>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  // Children right below their parent; the rows under a collapsed parent are left out.
  const tree = useMemo(() => treeOrder(visible, parentOf), [visible, parentOf]);
  const lines = useMemo(() => {
    if (!collapsed.size) return tree.rows;
    const out: Row[] = [];
    let hiddenBelow = Number.POSITIVE_INFINITY;
    for (const row of tree.rows) {
      const depth = tree.depth.get(row.id) ?? 0;
      if (depth > hiddenBelow) continue;
      hiddenBelow = collapsed.has(row.id) ? depth : Number.POSITIVE_INFINITY;
      out.push(row);
    }
    return out;
  }, [tree, collapsed]);
  const toggle = useCallback(
    (rowId: number) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (!next.delete(rowId)) next.add(rowId);
        return next;
      }),
    [],
  );
  const { ref, start, end } = useVirtual(lines.length, ROW_HEIGHT);
  // The title column is as wide as a long text.
  const widths = useMemo(
    () => types.map((schema, index) => (index === title ? WIDTHS.longtext : WIDTHS[schema.type])),
    [types, title],
  );
  const total = GUTTER + display.reduce((sum, index) => sum + (widths[index] ?? 0), 0);
  const narrowed = visible.length !== rows.length || !!state.sort;

  const add = () => {
    const id = createRow();
    if (id === undefined) return;
    // With filters or a sort, the new row may not be at the bottom, or not be listed at all: show its form.
    if (narrowed) return selectRow(id);
    setEditing({ id, column: title });
    requestAnimationFrame(() => ref.current?.scrollTo({ top: ref.current.scrollHeight }));
  };

  return (
    <div ref={ref} className="h-full overflow-auto">
      <div style={{ width: total }} className="min-w-full">
        <div className="bg-background text-muted-foreground sticky top-0 z-20 flex h-10 border-b">
          <div style={{ width: GUTTER }} className="bg-background sticky left-0 z-10 shrink-0 border-r" />
          {display.map((index) => (
            <HeaderCell key={columns[index]} column={columns[index] ?? ""} index={index} width={widths[index] ?? 0} />
          ))}
        </div>
        <div className="relative" style={{ height: lines.length * ROW_HEIGHT }}>
          {lines.slice(start, end).map((row, offset) => (
            <TableRow
              key={row.id}
              row={row}
              index={start + offset}
              widths={widths}
              editingColumn={editing?.id === row.id ? editing.column : -1}
              setEditing={setEditing}
              depth={tree.depth.get(row.id) ?? 0}
              collapsed={tree.children.has(row.id) ? collapsed.has(row.id) : undefined}
              onToggle={toggle}
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
