import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, EyeIcon, EyeOffIcon, GripVerticalIcon } from "lucide-react";
import { useState } from "react";
import { TypeIconFor } from "@/components/fields";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";
import { displayColumns } from "@/lib/workspace-store";

/** Names of every column in the order of the view, hidden ones included. */
export function useColumnLayout() {
  const { columns, state, setViewState } = useView();
  const names = displayColumns(columns, { order: state.order }).map((index) => columns[index] ?? "");
  const hidden = new Set(state.hidden);
  const shown = names.filter((name) => !hidden.has(name));

  return {
    names,
    isHidden: (name: string) => hidden.has(name),
    /** The last visible column cannot be hidden. */
    canHide: (name: string) => hidden.has(name) || shown.length > 1,
    toggle: (name: string) =>
      setViewState({ hidden: hidden.has(name) ? [...hidden].filter((n) => n !== name) : [...hidden, name] }),
    /** Puts `name` at position `to` among all columns. */
    move: (name: string, to: number) => {
      const next = names.filter((n) => n !== name);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, name);
      setViewState({ order: next });
    },
    /** Moves a column one step among the visible ones, hidden columns keep their place. */
    nudge: (name: string, step: -1 | 1) => {
      const neighbour = shown[shown.indexOf(name) + step];
      if (!neighbour) return;
      const next = [...names];
      const [a, b] = [next.indexOf(name), next.indexOf(neighbour)];
      next[a] = neighbour;
      next[b] = name;
      setViewState({ order: next });
    },
    showAll: () => setViewState({ hidden: [] }),
    shownCount: shown.length,
  };
}

const chip =
  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted/60";

export function ColumnsMenu() {
  const { types, columns, state } = useView();
  const layout = useColumnLayout();
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<string>();
  const hiddenCount = layout.names.length - layout.shownCount;
  const customized = hiddenCount > 0 || !!state.order;

  return (
    <Popover>
      <PopoverTrigger className={cn(chip, "font-medium", customized && "border-brand/40 bg-brand/5")}>
        <Columns3Icon className={cn("size-3.5", customized && "text-brand")} />
        Colonnes
        {hiddenCount > 0 && (
          <span className="text-muted-foreground font-normal">
            {hiddenCount} masquée{hiddenCount > 1 ? "s" : ""}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <p className="font-medium">Colonnes affichées</p>
          {hiddenCount > 0 && (
            <button type="button" onClick={layout.showAll} className="text-brand text-xs hover:underline">
              Tout afficher
            </button>
          )}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {layout.names.map((name, position) => {
            const hidden = layout.isHidden(name);
            const type = types[columns.indexOf(name)];
            return (
              <li
                key={name}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragged(name);
                }}
                onDragEnd={() => {
                  setDragged(undefined);
                  setOver(undefined);
                }}
                onDragOver={(event) => {
                  if (!dragged) return;
                  event.preventDefault();
                  setOver(name);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged && dragged !== name) layout.move(dragged, position);
                  setDragged(undefined);
                  setOver(undefined);
                }}
                className={cn(
                  "group hover:bg-accent flex items-center gap-1.5 rounded-lg py-1 pr-1 pl-0.5",
                  dragged === name && "opacity-40",
                  over === name && dragged !== name && "ring-brand ring-2 ring-inset",
                )}
              >
                <GripVerticalIcon className="text-muted-foreground size-4 shrink-0 cursor-grab" />
                {type && <TypeIconFor type={type.type} />}
                <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground")}>{name}</span>
                <span className="flex items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  {(["up", "down"] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      aria-label={`${direction === "up" ? "Monter" : "Descendre"} ${name}`}
                      disabled={hidden}
                      onClick={() => layout.nudge(name, direction === "up" ? -1 : 1)}
                      className="text-muted-foreground hover:bg-background hover:text-foreground grid size-6 place-items-center rounded-md disabled:pointer-events-none disabled:opacity-30"
                    >
                      {direction === "up" ? (
                        <ArrowUpIcon className="size-3.5" />
                      ) : (
                        <ArrowDownIcon className="size-3.5" />
                      )}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  aria-label={`${hidden ? "Afficher" : "Masquer"} ${name}`}
                  aria-pressed={!hidden}
                  disabled={!layout.canHide(name)}
                  onClick={() => layout.toggle(name)}
                  className="text-muted-foreground hover:bg-background hover:text-foreground grid size-6 place-items-center rounded-md disabled:pointer-events-none disabled:opacity-30"
                >
                  {hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs leading-relaxed">
          Ne change que cet affichage : le fichier CSV garde ses colonnes. Fait partie de la vue enregistrée.
        </p>
      </PopoverContent>
    </Popover>
  );
}
