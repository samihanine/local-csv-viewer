import { CheckIcon, CornerLeftUpIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { descendants, rowTitle } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

const MAX_LISTED = 100;
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A parent cell: the key it holds and the title of the row it points to. */
export function ParentValue({ value }: { value: string }) {
  const { byKey, title, keyColumn } = useView();
  if (!value) return null;
  const parent = byKey.get(value.trim());
  if (!parent)
    return (
      <span title="Aucune ligne n'a cet identifiant" className="text-destructive truncate">
        {value}
      </span>
    );
  return (
    <span className="bg-muted inline-flex h-[22px] max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-xs">
      <CornerLeftUpIcon className="text-muted-foreground size-3 shrink-0" />
      {keyColumn !== title && <span className="text-muted-foreground shrink-0 font-mono">{value}</span>}
      <span className="truncate font-medium">{rowTitle(parent, title)}</span>
    </span>
  );
}

/** Searchable list of the rows that can be the parent of `rowId`: neither itself nor one of its descendants. */
export function ParentPicker({
  rowId,
  value,
  onPick,
}: {
  rowId: number;
  value: string;
  onPick: (key: string) => void;
}) {
  const { rows, title, keyColumn, parentOf } = useView();
  const [search, setSearch] = useState("");
  const excluded = descendants(rowId, parentOf);
  const term = fold(search.trim());
  const candidates = rows
    .filter((row) => !excluded.has(row.id) && (row.cells[keyColumn] ?? "").trim())
    .filter((row) => !term || fold(`${row.cells[keyColumn]} ${rowTitle(row, title)}`).includes(term));

  return (
    <div className="flex flex-col gap-1">
      <Input
        autoFocus
        value={search}
        placeholder="Rechercher une ligne…"
        className="mb-1 h-8"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          const first = candidates[0];
          if (event.key === "Enter" && first) onPick((first.cells[keyColumn] ?? "").trim());
        }}
      />
      <div className="max-h-64 overflow-y-auto">
        {candidates.slice(0, MAX_LISTED).map((row) => {
          const key = (row.cells[keyColumn] ?? "").trim();
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onPick(key)}
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                key === value && "bg-accent/60",
              )}
            >
              {keyColumn !== title && (
                <span className="text-muted-foreground w-14 shrink-0 truncate font-mono text-xs">{key}</span>
              )}
              <span className="min-w-0 flex-1 truncate">{rowTitle(row, title)}</span>
              {key === value && <CheckIcon className="size-4 shrink-0" />}
            </button>
          );
        })}
        {!candidates.length && <p className="text-muted-foreground px-2 py-1.5">Aucune ligne</p>}
        {candidates.length > MAX_LISTED && (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            {candidates.length - MAX_LISTED} autres lignes : précisez la recherche.
          </p>
        )}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onPick("")}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
        >
          <XIcon className="size-4 shrink-0" /> Aucun parent
        </button>
      )}
    </div>
  );
}
