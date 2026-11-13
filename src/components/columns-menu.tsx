import { EyeIcon, EyeOffIcon } from "lucide-react";
import { TypeIconFor } from "@/components/fields";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";

/** Which columns the view shows. Their order is the one of the file, set in the schema. */
export function useColumnLayout() {
  const { columns, state, setViewState } = useView();
  const hidden = new Set(state.hidden);
  const shown = columns.filter((name) => !hidden.has(name));
  return {
    isHidden: (name: string) => hidden.has(name),
    /** The last visible column cannot be hidden. */
    canHide: (name: string) => hidden.has(name) || shown.length > 1,
    toggle: (name: string) =>
      setViewState({ hidden: hidden.has(name) ? [...hidden].filter((n) => n !== name) : [...hidden, name] }),
    showAll: () => setViewState({ hidden: [] }),
    hiddenCount: columns.length - shown.length,
  };
}

const chip =
  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted/60";

export function ColumnsMenu() {
  const { types, columns, openSchema } = useView();
  const layout = useColumnLayout();
  const { hiddenCount } = layout;

  return (
    <Popover>
      <PopoverTrigger className={cn(chip, "font-medium", hiddenCount > 0 && "border-brand/40 bg-brand/5")}>
        <EyeIcon className={cn("size-3.5", hiddenCount > 0 && "text-brand")} />
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
          {columns.map((name, index) => {
            const hidden = layout.isHidden(name);
            const type = types[index];
            return (
              <li key={name}>
                <button
                  type="button"
                  aria-label={`${hidden ? "Afficher" : "Masquer"} ${name}`}
                  aria-pressed={!hidden}
                  disabled={!layout.canHide(name)}
                  onClick={() => layout.toggle(name)}
                  className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left disabled:opacity-50"
                >
                  {type && <TypeIconFor type={type.type} />}
                  <span className={cn("min-w-0 flex-1 truncate", hidden && "text-muted-foreground")}>{name}</span>
                  {hidden ? (
                    <EyeOffIcon className="text-muted-foreground size-3.5" />
                  ) : (
                    <EyeIcon className="text-muted-foreground size-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs leading-relaxed">
          Masquer ne change que cet affichage. L'ordre des colonnes se règle dans le{" "}
          <button type="button" onClick={openSchema} className="text-brand hover:underline">
            schéma
          </button>
          .
        </p>
      </PopoverContent>
    </Popover>
  );
}
