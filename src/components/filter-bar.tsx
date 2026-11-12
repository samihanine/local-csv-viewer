import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkPlusIcon,
  LayersIcon,
  ListFilterIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { ColumnsMenu } from "@/components/columns-menu";
import { OptionBadge, optionColor, SimpleSelect, TypeIconFor } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { defaultGroupBy } from "@/components/views/kanban-view";
import { type Filter, isActive } from "@/lib/query";
import { type ColumnSchema, displayDate, own } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";
import type { SavedView } from "@/lib/workspace-store";

const chip =
  "flex h-8 max-w-64 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted/60";

function summary(filter: Filter, schema: ColumnSchema) {
  if (schema.type === "select") return (filter.values ?? []).map((value) => value || "Vide").join(", ");
  if (schema.type === "date") {
    const [from, to] = [filter.from && displayDate(filter.from), filter.to && displayDate(filter.to)];
    return from && to ? `${from} → ${to}` : from ? `à partir du ${from}` : to ? `jusqu'au ${to}` : "";
  }
  return filter.text?.trim() ?? "";
}

function FilterEditor({ column, schema, filter }: { column: string; schema: ColumnSchema; filter: Filter }) {
  const { state, setViewState, rows, columns } = useView();
  const change = (patch: Filter) => setViewState({ filters: { ...state.filters, [column]: { ...filter, ...patch } } });

  if (schema.type === "select") {
    const index = columns.indexOf(column);
    const known = (schema.options ?? []).map((option) => option.value);
    // Values present in the file but missing from the schema can still be filtered on.
    const extra = [...new Set(rows.map((row) => row.cells[index] ?? ""))]
      .filter((v) => v && !known.includes(v))
      .slice(0, 50);
    const selected = filter.values ?? [];
    const toggle = (value: string) =>
      change({ values: selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value] });
    return (
      <div className="max-h-72 overflow-y-auto">
        {[...known, ...extra, ""].map((value) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox is the control
          <label
            key={value}
            className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5"
          >
            <Checkbox checked={selected.includes(value)} onCheckedChange={() => toggle(value)} />
            {value ? (
              <OptionBadge value={value} color={optionColor(schema, value)} />
            ) : (
              <span className="text-muted-foreground">Vide</span>
            )}
          </label>
        ))}
      </div>
    );
  }

  if (schema.type === "date")
    return (
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 p-1">
        <label htmlFor="filter-from" className="text-muted-foreground">
          Du
        </label>
        <Input
          id="filter-from"
          type="date"
          className="h-8"
          value={filter.from ?? ""}
          onChange={(e) => change({ from: e.target.value })}
        />
        <label htmlFor="filter-to" className="text-muted-foreground">
          Au
        </label>
        <Input
          id="filter-to"
          type="date"
          className="h-8"
          value={filter.to ?? ""}
          onChange={(e) => change({ to: e.target.value })}
        />
      </div>
    );

  return (
    <Input
      autoFocus
      className="h-8"
      placeholder={`${column} contient…`}
      value={filter.text ?? ""}
      onChange={(event) => change({ text: event.target.value })}
    />
  );
}

type FilterBarProps = {
  /** Column whose filter editor is open. */
  open: string | undefined;
  onOpenChange: (column: string | undefined) => void;
  activeView: SavedView | undefined;
  dirty: boolean;
  onSaveView: (name: string) => void;
  onUpdateView: () => void;
};

export function FilterBar({ open, onOpenChange, activeView, dirty, onSaveView, onUpdateView }: FilterBarProps) {
  const { columns, types, state, setViewState, editFilter } = useView();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const filtered = columns.filter((column) => own(state.filters, column));
  const available = columns.filter((column) => !own(state.filters, column));
  const schemaOf = (column: string) => types[columns.indexOf(column)] as ColumnSchema;
  const groupBy = state.groupBy && columns.includes(state.groupBy) ? state.groupBy : defaultGroupBy(columns, types);

  const remove = (column: string) => {
    setViewState({ filters: Object.fromEntries(Object.entries(state.filters).filter(([key]) => key !== column)) });
    if (open === column) onOpenChange(undefined);
  };

  const save = () => {
    if (!name.trim()) return;
    onSaveView(name.trim());
    setName("");
    setSaving(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2.5 max-sm:px-4">
      {state.mode === "kanban" && (
        <div className="flex items-center gap-1.5">
          <LayersIcon className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-[13px]">Grouper par</span>
          <SimpleSelect
            aria-label="Grouper par"
            value={groupBy ?? ""}
            onChange={(value) => setViewState({ groupBy: value })}
            options={[
              ...(groupBy ? [] : [{ value: "", label: "Choisir…" }]),
              ...columns.map((column) => ({ value: column, label: column })),
            ]}
            className="h-8! max-w-48 text-[13px]"
          />
          <span className="bg-border mx-1 h-5 w-px" />
        </div>
      )}

      {filtered.map((column) => {
        const schema = schemaOf(column);
        const filter = own(state.filters, column) ?? {};
        const active = isActive(filter, schema.type);
        return (
          <Popover key={column} open={open === column} onOpenChange={(next) => onOpenChange(next ? column : undefined)}>
            <div className="flex">
              <PopoverTrigger className={cn(chip, "rounded-r-none border-r-0", active && "border-brand/40 bg-brand/5")}>
                <TypeIconFor type={schema.type} className={cn(active && "text-brand")} />
                <span className="shrink-0 font-medium">{column}</span>
                {active && <span className="text-muted-foreground truncate">{summary(filter, schema)}</span>}
              </PopoverTrigger>
              <button
                type="button"
                aria-label={`Retirer le filtre ${column}`}
                onClick={() => remove(column)}
                className={cn(
                  chip,
                  "text-muted-foreground hover:text-foreground rounded-l-none px-1.5",
                  active && "border-brand/40 bg-brand/5",
                )}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <PopoverContent className="w-64 p-2">
              <FilterEditor column={column} schema={schema} filter={filter} />
            </PopoverContent>
          </Popover>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!available.length}
          className={cn(
            chip,
            "text-muted-foreground hover:text-foreground border-dashed disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {filtered.length ? <PlusIcon className="size-3.5" /> : <ListFilterIcon className="size-3.5" />}
          Filtre
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Filtrer sur la colonne</DropdownMenuLabel>
          {available.map((column) => (
            <DropdownMenuItem key={column} onClick={() => editFilter(column)}>
              <TypeIconFor type={schemaOf(column).type} />
              <span className="truncate">{column}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {state.sort && columns.includes(state.sort.column) && (
        <div className="flex">
          <button
            type="button"
            title="Inverser le tri"
            onClick={() => state.sort && setViewState({ sort: { ...state.sort, desc: !state.sort.desc } })}
            className={cn(chip, "rounded-r-none border-r-0")}
          >
            {state.sort.desc ? <ArrowDownIcon className="size-3.5" /> : <ArrowUpIcon className="size-3.5" />}
            <span className="text-muted-foreground">Tri</span>
            <span className="truncate font-medium">{state.sort.column}</span>
          </button>
          <button
            type="button"
            aria-label="Retirer le tri"
            onClick={() => setViewState({ sort: undefined })}
            className={cn(chip, "text-muted-foreground hover:text-foreground rounded-l-none px-1.5")}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <ColumnsMenu />
        {activeView && dirty && (
          <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={onUpdateView}>
            Mettre à jour « {activeView.name} »
          </Button>
        )}
        <Popover open={saving} onOpenChange={setSaving}>
          <PopoverTrigger className={cn(chip, "font-medium")}>
            <BookmarkPlusIcon className="size-3.5" /> Enregistrer la vue
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="space-y-1">
                <p className="font-medium">Nouvelle vue</p>
                <p className="text-muted-foreground text-xs">
                  Mémorise le mode d'affichage, la recherche, les filtres, le tri et le regroupement.
                </p>
              </div>
              <Input
                autoFocus
                className="h-9"
                placeholder="Nom de la vue"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" size="sm" className="h-9 w-full text-sm" disabled={!name.trim()}>
                Enregistrer
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
