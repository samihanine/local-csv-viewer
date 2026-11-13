import {
  CheckIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileUpIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildPlainXlsx, type Cell, cellText, readFirstSheet, type Sheet, toClipboardText } from "@/lib/excel-tools";
import { useVirtual } from "@/lib/use-virtual";
import { baseName, cn, downloadBlob, formatNumber } from "@/lib/utils";

const ROW_HEIGHT = 34;
const GUTTER = 56;
const COLUMN_WIDTH = 180;
const ACCEPT = ".xlsx,.xlsm";

const isExcel = (file: File) => /\.(xlsx|xlsm)$/i.test(file.name);

function DataTable({ rows }: { rows: Cell[][] }) {
  const [header = [], ...body] = rows;
  const { ref, start, end } = useVirtual(body.length, ROW_HEIGHT);
  const width = GUTTER + header.length * COLUMN_WIDTH;

  return (
    <div ref={ref} className="h-full overflow-auto">
      <div style={{ width }} className="min-w-full">
        <div className="bg-muted/70 sticky top-0 z-20 flex h-9 border-b backdrop-blur">
          <div
            style={{ width: GUTTER }}
            className="bg-muted text-muted-foreground sticky left-0 z-10 flex shrink-0 items-center justify-center border-r text-xs"
          >
            1
          </div>
          {header.map((cell, c) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
              key={c}
              style={{ width: COLUMN_WIDTH }}
              title={cellText(cell)}
              className="flex shrink-0 items-center truncate border-r px-3 font-semibold"
            >
              <span className="truncate">{cellText(cell)}</span>
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: body.length * ROW_HEIGHT }}>
          {body.slice(start, end).map((row, offset) => {
            const index = start + offset;
            return (
              <div
                key={index}
                className="hover:bg-muted/40 absolute left-0 flex border-b"
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <div
                  style={{ width: GUTTER }}
                  className="bg-background text-muted-foreground sticky left-0 z-10 flex shrink-0 items-center justify-center border-r text-xs tabular-nums"
                >
                  {index + 2}
                </div>
                {row.map((cell, c) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                    key={c}
                    style={{ width: COLUMN_WIDTH }}
                    title={cellText(cell)}
                    className={cn(
                      "flex shrink-0 items-center border-r px-3",
                      typeof cell === "number" && "justify-end tabular-nums",
                    )}
                  >
                    <span className="truncate">{cellText(cell)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Opens an Excel file, shows its first sheet, and gives it back as a plain workbook or as clipboard text. */
export function ExcelPage({ hidden = false }: { hidden?: boolean }) {
  const [file, setFile] = useState<{ name: string; sheet: Sheet }>();
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (next: File | undefined) => {
    if (!next) return;
    if (!isExcel(next)) return toast.error("Choisissez un fichier Excel (.xlsx).");
    setLoading(true);
    try {
      const sheet = await readFirstSheet(next);
      if (!sheet.rows.length) throw new Error("La première feuille est vide.");
      setFile({ name: next.name, sheet });
      setCopied(false);
    } catch (error) {
      toast.error(`Lecture impossible : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!file) return;
    const body = file.sheet.rows.slice(1);
    try {
      await navigator.clipboard.writeText(toClipboardText(body));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(
        `${formatNumber(body.length)} ligne${body.length > 1 ? "s" : ""} copiée${body.length > 1 ? "s" : ""}, sans la première`,
      );
    } catch (error) {
      toast.error(`Copie impossible : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const download = () => {
    if (!file) return;
    const blob = new Blob([buildPlainXlsx(file.sheet) as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `${baseName(file.name)}.xlsx`);
  };

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void load(event.dataTransfer.files[0]);
    },
  };

  const columns = file?.sheet.rows[0]?.length ?? 0;
  const rows = Math.max(0, (file?.sheet.rows.length ?? 0) - 1);

  return (
    <section
      aria-label="Lecteur Excel"
      {...dropHandlers}
      className={cn(
        "bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm",
        hidden && "hidden",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6 max-sm:px-4">
        <p className="flex min-w-0 items-center gap-2 text-[15px]">
          <span className="text-muted-foreground max-sm:hidden">Lecteur Excel</span>
          {file && (
            <>
              <span className="text-muted-foreground max-sm:hidden">/</span>
              <span className="truncate font-medium">{file.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs max-md:hidden">
                {file.sheet.name} · {formatNumber(rows)} ligne{rows > 1 ? "s" : ""} · {columns} colonne
                {columns > 1 ? "s" : ""}
              </span>
            </>
          )}
        </p>
        {file && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={() => setFile(undefined)}>
              <XIcon /> Fermer
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={download}>
              <DownloadIcon /> Télécharger le Excel
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-[13px]"
              onClick={() => void copy()}
              title="Copie toutes les lignes sauf la première, à coller dans Excel"
            >
              {copied ? <CheckIcon /> : <ClipboardCopyIcon />} Copier sans l'en-tête
            </Button>
          </div>
        )}
      </header>

      {file ? (
        <div className="min-h-0 flex-1">
          <DataTable rows={file.sheet.rows} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
          <label
            className={cn(
              "hover:bg-muted/40 flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors",
              dragging && "border-[oklch(0.65_0.17_155)] bg-[oklch(0.65_0.17_155)]/5",
              loading && "pointer-events-none opacity-60",
            )}
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-linear-to-b from-[oklch(0.72_0.17_155)] to-[oklch(0.58_0.15_160)] text-white shadow-lg shadow-[oklch(0.65_0.17_155)]/25">
              {loading ? <Loader2Icon className="size-6 animate-spin" /> : <FileSpreadsheetIcon className="size-6" />}
            </span>
            <span className="space-y-1">
              <span className="block text-lg font-semibold tracking-tight">Déposez un fichier Excel</span>
              <span className="text-muted-foreground block">ou cliquez pour le choisir sur l'ordinateur</span>
            </span>
            <span className="text-muted-foreground max-w-sm text-[13px] leading-relaxed">
              La première feuille est affichée. Vous pourrez la télécharger en Excel brut, ou copier ses lignes (sans la
              première) pour les coller dans un autre classeur.
            </span>
            <span className="bg-muted text-muted-foreground flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs">
              <FileUpIcon className="size-3.5" /> .xlsx · rien n'est envoyé sur Internet
            </span>
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                void load(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {file && dragging && (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-xl border-2 border-dashed border-[oklch(0.65_0.17_155)] bg-[oklch(0.65_0.17_155)]/10 backdrop-blur-[1px]">
          <p className="bg-background rounded-lg px-3 py-1.5 font-medium shadow">Déposer pour remplacer le fichier</p>
        </div>
      )}
    </section>
  );
}
