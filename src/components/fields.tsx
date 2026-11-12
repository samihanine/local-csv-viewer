import {
  CalendarIcon,
  CheckIcon,
  CircleChevronDownIcon,
  PlusIcon,
  TextAlignStartIcon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { plainText } from "@/lib/markdown";
import {
  type ColumnSchema,
  type ColumnType,
  displayDate,
  formatDate,
  nextColor,
  type OptionColor,
  parseDate,
} from "@/lib/schema";
import { cn } from "@/lib/utils";

const TYPE_ICONS = { text: TypeIcon, longtext: TextAlignStartIcon, date: CalendarIcon, select: CircleChevronDownIcon };

export function TypeIconFor({ type, className }: { type: ColumnType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={cn("text-muted-foreground size-3.5 shrink-0", className)} />;
}

export const optionColor = (schema: ColumnSchema, value: string): OptionColor =>
  schema.options?.find((option) => option.value === value)?.color ?? "gray";

export function OptionBadge({ value, color, className }: { value: string; color: OptionColor; className?: string }) {
  return (
    <span
      data-color={color}
      className={cn(
        "bg-option text-option-foreground inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        className,
      )}
    >
      <span className="bg-option-dot size-1.5 shrink-0 rounded-full" />
      <span className="truncate">{value}</span>
    </span>
  );
}

/** Read-only rendering of a cell, on one line. */
export function CellValue({ value, schema }: { value: string; schema: ColumnSchema }) {
  if (!value) return null;
  if (schema.type === "select") return <OptionBadge value={value} color={optionColor(schema, value)} />;
  if (schema.type === "date")
    return <span className="truncate tabular-nums">{displayDate(value, schema.dateFormat)}</span>;
  return <span className="truncate">{schema.type === "longtext" ? plainText(value) : value}</span>;
}

type SimpleSelectProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  "aria-label"?: string;
};

export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: SimpleSelectProps<T>) {
  return (
    <Select items={options} value={value} onValueChange={(next) => next !== null && onChange(next as T)}>
      <SelectTrigger className={cn("data-[size=default]:h-9", className)} aria-label={props["aria-label"]}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-44 p-1">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type DraftInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
  onCancel?: () => void;
};

/** Text input that writes on Enter or when it loses focus, and gives up on Escape. */
export function DraftInput({ value, onCommit, onCancel, className, onKeyDown, ...props }: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Input
      {...props}
      value={draft}
      className={cn("h-9", className)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          onCancel?.();
        }
      }}
    />
  );
}

type OptionPickerProps = {
  schema: ColumnSchema;
  value: string;
  onPick: (value: string) => void;
  /** Adds a new option to the column. */
  onSchemaChange: (schema: ColumnSchema) => void;
};

/** Searchable list of the options of a column. Typing a new name offers to create it. */
export function OptionPicker({ schema, value, onPick, onSchemaChange }: OptionPickerProps) {
  const [search, setSearch] = useState("");
  const options = schema.options ?? [];
  const term = search.trim();
  const matches = options.filter((option) => option.value.toLowerCase().includes(term.toLowerCase()));
  const canCreate = term !== "" && !options.some((option) => option.value.toLowerCase() === term.toLowerCase());

  const create = () => {
    onSchemaChange({ ...schema, options: [...options, { value: term, color: nextColor(options) }] });
    onPick(term);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        autoFocus
        value={search}
        placeholder="Rechercher ou créer…"
        className="mb-1 h-8"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (canCreate && !matches.length) create();
          else if (matches[0]) onPick(matches[0].value);
        }}
      />
      <div className="max-h-60 overflow-y-auto">
        {matches.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPick(option.value)}
            className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5"
          >
            <OptionBadge value={option.value} color={option.color} />
            {option.value === value && <CheckIcon className="size-4 shrink-0" />}
          </button>
        ))}
        {!matches.length && !canCreate && <p className="text-muted-foreground px-2 py-1.5">Aucune option</p>}
      </div>
      {canCreate && (
        <button
          type="button"
          onClick={create}
          className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
        >
          <PlusIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">Créer « {term} »</span>
        </button>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onPick("")}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
        >
          <XIcon className="size-4 shrink-0" /> Effacer
        </button>
      )}
    </div>
  );
}

type FieldProps = {
  value: string;
  schema: ColumnSchema;
  onChange: (value: string) => void;
  onSchemaChange: (schema: ColumnSchema) => void;
  label: string;
};

/** Form control for one cell, by column type. Used by the detail view. */
export function FieldEditor({ value, schema, onChange, onSchemaChange, label }: FieldProps) {
  const [open, setOpen] = useState(false);

  if (schema.type === "longtext") return <MarkdownEditor value={value} onCommit={onChange} previewFirst />;

  if (schema.type === "date") {
    const iso = parseDate(value, schema.dateFormat);
    return (
      <div className="flex items-center gap-3">
        <Input
          type="date"
          aria-label={label}
          value={iso ?? ""}
          className="h-9 w-44"
          onChange={(event) => onChange(event.target.value ? formatDate(event.target.value, schema.dateFormat) : "")}
        />
        {value && !iso && <span className="text-muted-foreground truncate text-xs">Valeur actuelle : « {value} »</span>}
      </div>
    );
  }

  if (schema.type === "select")
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={label}
          className="border-input hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border px-2.5 text-left outline-none focus-visible:ring-3"
        >
          {value ? (
            <OptionBadge value={value} color={optionColor(schema, value)} />
          ) : (
            <span className="text-muted-foreground">Choisir…</span>
          )}
          <CircleChevronDownIcon className="text-muted-foreground ml-auto size-4 shrink-0" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <OptionPicker
            schema={schema}
            value={value}
            onSchemaChange={onSchemaChange}
            onPick={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    );

  return <DraftInput aria-label={label} value={value} onCommit={onChange} placeholder="Vide" />;
}
