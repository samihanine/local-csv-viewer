import { ArrowRightIcon, FileUpIcon, ListPlusIcon, Loader2Icon, ReplaceIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SimpleSelect } from "@/components/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyMapping, autoMap, type ImportMode, readTable, sameColumns, type Table, type Target } from "@/lib/import";
import type { Schema } from "@/lib/schema";
import { cn, formatNumber } from "@/lib/utils";

const NEW = "\u0000new";
const SKIP = "\u0000skip";

const toValue = (target: Target) => (target.kind === "column" ? target.name : target.kind === "new" ? NEW : SKIP);
const fromValue = (value: string): Target =>
  value === NEW ? { kind: "new" } : value === SKIP ? { kind: "skip" } : { kind: "column", name: value };

const MODES = [
  { value: "append", icon: ListPlusIcon, label: "Ajouter à la fin", hint: "Les lignes actuelles sont conservées." },
  { value: "replace", icon: ReplaceIcon, label: "Remplacer", hint: "Les lignes actuelles sont supprimées." },
] as const;

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: string[];
  rowCount: number;
  schema: Schema;
  onImport: (table: Table, mode: ImportMode) => void;
};

export function ImportDialog({ open, onOpenChange, columns, rowCount, schema, onImport }: ImportDialogProps) {
  const [source, setSource] = useState<{ name: string; table: Table }>();
  const [targets, setTargets] = useState<Target[]>([]);
  const [mode, setMode] = useState<ImportMode>("append");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setSource(undefined);
    setTargets([]);
    setMode("append");
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const table = await readTable(file);
      if (!table.columns.length) throw new Error("Ce fichier ne contient aucune colonne.");
      setSource({ name: file.name, table });
      setTargets(autoMap(table.columns, columns));
    } catch (error) {
      toast.error(`Lecture impossible : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const identical = !!source && sameColumns(source.table.columns, columns);
  const used = new Set(targets.flatMap((target) => (target.kind === "column" ? [target.name] : [])));
  const kept = targets.filter((target) => target.kind !== "skip").length;

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const confirm = () => {
    if (!source) return;
    onImport(applyMapping(source.table, targets, columns, schema), mode);
    toast.success(
      `${formatNumber(source.table.rows.length)} ligne${source.table.rows.length > 1 ? "s" : ""} ${mode === "append" ? "ajoutée" : "importée"}${source.table.rows.length > 1 ? "s" : ""}`,
    );
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer des lignes</DialogTitle>
          <DialogDescription>
            Depuis un fichier CSV ou XLSX. Les lignes sont écrites dans le CSV ouvert dès la validation.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {!source ? (
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void load(event.dataTransfer.files[0]);
              }}
              className={cn(
                "hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
                dragging && "border-brand bg-brand/5",
              )}
            >
              <span className="bg-muted grid size-12 place-items-center rounded-xl">
                {loading ? <Loader2Icon className="size-5 animate-spin" /> : <FileUpIcon className="size-5" />}
              </span>
              <span className="font-medium">Déposez un fichier ici, ou cliquez pour parcourir</span>
              <span className="text-muted-foreground">CSV ou XLSX (première feuille)</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                className="sr-only"
                disabled={loading}
                onChange={(event) => {
                  void load(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          ) : (
            <>
              <div className="bg-muted/50 flex items-center gap-3 rounded-xl px-4 py-3">
                <FileUpIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{source.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatNumber(source.table.rows.length)} lignes · {source.table.columns.length} colonnes
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={reset}>
                  Changer
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={cn(
                      "hover:bg-muted/50 flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      mode === option.value && "border-foreground/60 ring-foreground/60 ring-1",
                    )}
                  >
                    <option.icon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {option.value === "replace" && rowCount
                          ? `Les ${formatNumber(rowCount)} lignes actuelles sont supprimées.`
                          : option.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="font-medium">Correspondance des colonnes</p>
                  <p className="text-muted-foreground text-xs">
                    {identical
                      ? "Les colonnes sont identiques à celles du fichier ouvert."
                      : "Les colonnes diffèrent : indiquez où va chacune d'elles."}
                  </p>
                </div>
                <div className="divide-y rounded-xl border">
                  {source.table.columns.map((column, index) => {
                    const target = targets[index] ?? { kind: "skip" };
                    const options = [
                      ...columns
                        .filter((name) => !used.has(name) || (target.kind === "column" && target.name === name))
                        .map((name) => ({ value: name, label: name })),
                      { value: NEW, label: "＋ Nouvelle colonne" },
                      { value: SKIP, label: "Ignorer" },
                    ];
                    return (
                      <div key={column} className="flex items-center gap-3 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate" title={column}>
                          {column}
                        </span>
                        <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" />
                        <SimpleSelect
                          aria-label={`Destination de ${column}`}
                          value={toValue(target)}
                          onChange={(value) => setTargets(targets.with(index, fromValue(value)))}
                          options={options}
                          className={cn("h-8! w-52 text-[13px]", target.kind === "skip" && "text-muted-foreground")}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DialogBody>
        {source && (
          <DialogFooter>
            <Button variant="ghost" size="sm" className="h-9 px-3 text-sm" onClick={close}>
              Annuler
            </Button>
            <Button size="sm" className="h-9 px-3 text-sm" disabled={!kept} onClick={confirm}>
              {mode === "append" ? "Ajouter" : "Remplacer par"} {formatNumber(source.table.rows.length)} ligne
              {source.table.rows.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
