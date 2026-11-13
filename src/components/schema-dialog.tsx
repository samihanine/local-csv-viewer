import {
  ArrowDownIcon,
  ArrowUpIcon,
  BracesIcon,
  DownloadIcon,
  GripVerticalIcon,
  ListOrderedIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DraftInput, SimpleSelect } from "@/components/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Dataset } from "@/lib/csv";
import {
  COLUMN_TYPES,
  type ColumnSchema,
  columnSchema,
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  detectSchema,
  formatId,
  MAX_DIGITS,
  nextColor,
  OPTION_COLORS,
  parseSchemaFile,
  type Schema,
  type SelectOption,
  sortOptions,
  TYPE_LABELS,
  titleIndex,
  toSchemaFile,
} from "@/lib/schema";
import { baseName, cn, downloadBlob } from "@/lib/utils";

const TYPE_OPTIONS = COLUMN_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
const FORMAT_OPTIONS = DATE_FORMATS.map((value) => ({ value, label: DATE_FORMAT_LABELS[value] }));
const MAX_SCHEMA_BYTES = 2_000_000;

function OptionsEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || options.some((option) => option.value === value)) return;
    onChange([...options, { value, color: nextColor(options) }]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-9">
      {options.map((option) => (
        <span
          key={option.value}
          data-color={option.color}
          className="bg-option text-option-foreground flex h-7 max-w-full items-center rounded-md text-xs font-medium"
        >
          <Popover>
            <PopoverTrigger
              title="Changer la couleur"
              aria-label={`Couleur de ${option.value}`}
              className="grid h-full w-6 place-items-center rounded-l-md outline-none hover:bg-black/5"
            >
              <span className="bg-option-dot size-2 rounded-full" />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="grid grid-cols-5 gap-1.5">
                {OPTION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    data-color={color}
                    aria-label={color}
                    onClick={() => onChange(options.map((o) => (o.value === option.value ? { ...o, color } : o)))}
                    className={cn(
                      "bg-option grid size-7 place-items-center rounded-md transition-transform hover:scale-110",
                      color === option.color && "ring-foreground/60 ring-2",
                    )}
                  >
                    <span className="bg-option-dot size-2.5 rounded-full" />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <span className="truncate">{option.value}</span>
          <button
            type="button"
            aria-label={`Retirer l'option ${option.value}`}
            onClick={() => onChange(options.filter((o) => o.value !== option.value))}
            className="grid h-full w-6 place-items-center rounded-r-md opacity-60 hover:bg-black/5 hover:opacity-100"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        placeholder="Ajouter une option…"
        className="h-7 w-40 text-xs md:text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => event.key === "Enter" && add()}
      />
    </div>
  );
}

type SchemaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  data: Dataset;
  schema: Schema;
  onSchemaChange: (schema: Schema) => void;
  onAddColumn: (name: string) => void;
  onRenameColumn: (from: string, to: string) => void;
  onDeleteColumn: (name: string) => void;
  onMoveColumn: (name: string, to: number) => void;
  /** Numbers the rows that have no identifier yet. Returns how many were filled. */
  onFillIds: (column: string) => number;
};

function IdSettings({
  column,
  schema,
  onChange,
  onFill,
}: {
  column: string;
  schema: ColumnSchema;
  onChange: (schema: ColumnSchema) => void;
  onFill: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 pl-9">
      <div className="space-y-1">
        <span className="text-muted-foreground block text-xs">Préfixe</span>
        <Input
          aria-label={`Préfixe de ${column}`}
          value={schema.prefix ?? ""}
          placeholder="ex. T-"
          maxLength={20}
          className="h-8 w-28"
          onChange={(event) => onChange({ ...schema, prefix: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground block text-xs">Chiffres minimum</span>
        <Input
          aria-label={`Nombre de chiffres de ${column}`}
          type="number"
          min={0}
          max={MAX_DIGITS}
          value={schema.digits ?? 0}
          className="h-8 w-28"
          onChange={(event) =>
            onChange({
              ...schema,
              digits: Math.max(0, Math.min(MAX_DIGITS, Math.trunc(Number(event.target.value)) || 0)),
            })
          }
        />
      </div>
      <p className="text-muted-foreground flex h-8 items-center gap-1.5 text-xs">
        Exemple :<span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono">{formatId(1, schema)}</span>
        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono">{formatId(42, schema)}</span>
      </p>
      <Button variant="outline" size="sm" className="ml-auto h-8 text-[13px]" onClick={onFill}>
        <ListOrderedIcon /> Numéroter les lignes vides
      </Button>
    </div>
  );
}

export function SchemaDialog(props: SchemaDialogProps) {
  const { open, onOpenChange, fileName, data, schema, onSchemaChange, onAddColumn, onRenameColumn, onDeleteColumn } =
    props;
  const { onMoveColumn, onFillIds } = props;
  const { columns, rows } = data;
  const upload = useRef<HTMLInputElement>(null);
  const [newColumn, setNewColumn] = useState("");
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<string>();
  const title = titleIndex(columns, schema);

  const setTitle = (column: string) =>
    onSchemaChange(
      Object.fromEntries(
        columns.map((name) => {
          const { title: _, ...rest } = columnSchema(schema, name);
          return [name, name === column ? { ...rest, title: true } : rest];
        }),
      ),
    );

  const fill = (column: string) => {
    const filled = onFillIds(column);
    toast.success(
      filled
        ? `${filled} identifiant${filled > 1 ? "s" : ""} attribué${filled > 1 ? "s" : ""}`
        : "Toutes les lignes ont déjà un identifiant",
    );
  };

  const exists = (name: string) => columns.some((column) => column.toLowerCase() === name.toLowerCase());
  const setColumn = (column: string, next: ColumnSchema) => onSchemaChange({ ...schema, [column]: next });

  const setType = (column: string, current: ColumnSchema, type: ColumnSchema["type"]) => {
    const next: ColumnSchema = { ...current, type };
    // Switching to options starts from the values already in the file.
    if (type === "select" && !current.options?.length) {
      const index = columns.indexOf(column);
      const values = [...new Set(rows.map((row) => row.cells[index] ?? ""))].filter(Boolean).slice(0, 30);
      next.options = values.reduce<SelectOption[]>((all, value) => all.concat({ value, color: nextColor(all) }), []);
    }
    if (type === "date") next.dateFormat ??= "iso";
    if (type === "id") {
      next.prefix ??= "";
      next.digits ??= 0;
    }
    setColumn(column, next);
  };

  const detect = () => {
    const detected = detectSchema(columns, rows, schema);
    onSchemaChange({ ...schema, ...detected });
    const changed = columns.filter(
      (column) => columnSchema(schema, column).type !== columnSchema(detected, column).type,
    );
    toast.success(
      changed.length
        ? `${changed.length} colonne${changed.length > 1 ? "s" : ""} mise${changed.length > 1 ? "s" : ""} à jour`
        : "Les types détectés correspondent déjà au schéma",
    );
  };

  const download = () => {
    const json = JSON.stringify(toSchemaFile(columns, schema), null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${baseName(fileName)}.schema.json`);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_SCHEMA_BYTES) throw new Error("Ce fichier est trop volumineux pour un schéma.");
      const imported = parseSchemaFile(await file.text());
      const matched = columns.filter((column) => Object.hasOwn(imported, column));
      if (!matched.length) throw new Error("Aucune colonne de ce schéma ne correspond au fichier.");
      onSchemaChange({
        ...schema,
        ...Object.fromEntries(matched.map((column) => [column, imported[column] as ColumnSchema])),
      });
      toast.success(
        `Schéma appliqué à ${matched.length} colonne${matched.length > 1 ? "s" : ""} sur ${columns.length}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const addColumn = () => {
    const name = newColumn.trim();
    if (!name) return;
    if (exists(name)) return toast.error(`La colonne « ${name} » existe déjà.`);
    onAddColumn(name);
    setNewColumn("");
  };

  const rename = (from: string, raw: string) => {
    const to = raw.trim();
    if (!to || to === from) return;
    if (exists(to) && to.toLowerCase() !== from.toLowerCase()) return toast.error(`La colonne « ${to} » existe déjà.`);
    onRenameColumn(from, to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Schéma des colonnes</DialogTitle>
          <DialogDescription>
            Types, ordre et titre des colonnes. Rien n'est écrit tant que vous ne cliquez pas sur « Enregistrer ».
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <Button size="sm" className="h-8 text-[13px]" onClick={detect}>
            <WandSparklesIcon /> Détecter les types
          </Button>
          <span className="flex-1" />
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={download}>
            <DownloadIcon /> Télécharger le JSON
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => upload.current?.click()}>
            <UploadIcon /> Importer un JSON
          </Button>
          <input
            ref={upload}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Fichier de schéma"
            onChange={(event) => {
              void onUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <DialogBody className="space-y-2 py-4">
          {columns.map((column, index) => {
            const current = columnSchema(schema, column);
            const isTitle = index === title;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: drag and drop is a shortcut, the arrow buttons do the same
              <div
                key={column}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragged(column);
                }}
                onDragEnd={() => {
                  setDragged(undefined);
                  setOver(undefined);
                }}
                onDragOver={(event) => {
                  if (!dragged) return;
                  event.preventDefault();
                  setOver(column);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged && dragged !== column) onMoveColumn(dragged, index);
                  setDragged(undefined);
                  setOver(undefined);
                }}
                className={cn(
                  "group hover:bg-muted/40 space-y-2 rounded-xl border py-2.5 pr-3 pl-1.5 transition-colors",
                  dragged === column && "opacity-40",
                  over === column && dragged !== column && "ring-brand ring-2",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <GripVerticalIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0 cursor-grab active:cursor-grabbing"
                  />
                  <button
                    type="button"
                    aria-label={
                      isTitle ? `${column} est le titre des lignes` : `Utiliser ${column} comme titre des lignes`
                    }
                    aria-pressed={isTitle}
                    title={isTitle ? "Titre des lignes (affiché en gras)" : "Définir comme titre des lignes"}
                    onClick={() => setTitle(column)}
                    className="hover:bg-muted grid size-7 shrink-0 place-items-center rounded-md"
                  >
                    <StarIcon
                      className={cn(
                        "size-4",
                        isTitle
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40 group-hover:text-muted-foreground",
                      )}
                    />
                  </button>
                  <DraftInput
                    aria-label={`Nom de la colonne ${column}`}
                    value={column}
                    onCommit={(name) => rename(column, name)}
                    className="hover:border-input h-8 min-w-0 flex-1 border-transparent font-medium shadow-none"
                  />
                  {current.type === "date" && (
                    <SimpleSelect
                      aria-label={`Format de date de ${column}`}
                      value={current.dateFormat ?? "iso"}
                      onChange={(dateFormat) => setColumn(column, { ...current, dateFormat })}
                      options={FORMAT_OPTIONS}
                      className="h-8! w-36 text-[13px]"
                    />
                  )}
                  <SimpleSelect
                    aria-label={`Type de ${column}`}
                    value={current.type}
                    onChange={(type) => setType(column, current, type)}
                    options={TYPE_OPTIONS}
                    className="h-8! w-36 text-[13px]"
                  />
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Monter ${column}`}
                      disabled={index === 0}
                      className="text-muted-foreground size-8"
                      onClick={() => onMoveColumn(column, index - 1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Descendre ${column}`}
                      disabled={index === columns.length - 1}
                      className="text-muted-foreground size-8"
                      onClick={() => onMoveColumn(column, index + 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Supprimer la colonne ${column}`}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-8"
                    onClick={() =>
                      window.confirm(`Supprimer la colonne « ${column} » et toutes ses valeurs du fichier CSV ?`) &&
                      onDeleteColumn(column)
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                {current.type === "id" && (
                  <IdSettings
                    column={column}
                    schema={current}
                    onChange={(next) => setColumn(column, next)}
                    onFill={() => fill(column)}
                  />
                )}
                {current.type === "select" && (
                  <OptionsEditor
                    options={sortOptions(current.options ?? [])}
                    onChange={(options) => setColumn(column, { ...current, options })}
                  />
                )}
              </div>
            );
          })}
          {!columns.length && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8">
              <BracesIcon className="size-6" />
              <p>Ce fichier n'a pas encore de colonne.</p>
            </div>
          )}
          <form
            className="flex items-center gap-2 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              addColumn();
            }}
          >
            <Input
              value={newColumn}
              placeholder="Nom d'une nouvelle colonne"
              className="h-9"
              onChange={(event) => setNewColumn(event.target.value)}
            />
            <Button type="submit" variant="outline" size="sm" className="h-9 px-3 text-sm" disabled={!newColumn.trim()}>
              <PlusIcon /> Ajouter
            </Button>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
