import { ChartGanttIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { SimpleSelect } from "@/components/fields";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { guessPhases, PHASE_COLORS } from "@/lib/gantt";
import { OPTION_COLORS } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/view-context";
import type { Phase } from "@/lib/workspace-store";

/** The phases of the gantt: the ones saved in the view, or the ones guessed from the column names. */
export function usePhases() {
  const { columns, types, state } = useView();
  return state.phases ?? guessPhases(columns, types);
}

const chip =
  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted/60";

export function PhasesMenu() {
  const { columns, types, setViewState } = useView();
  const phases = usePhases();
  const set = (next: Phase[]) => setViewState({ phases: next });
  const update = (id: string, patch: Partial<Phase>) =>
    set(phases.map((phase) => (phase.id === id ? { ...phase, ...patch } : phase)));

  // Date columns first: they are the ones a phase is made of.
  const columnOptions = [
    ...columns.filter((_, i) => types[i]?.type === "date"),
    ...columns.filter((_, i) => types[i]?.type !== "date"),
  ].map((name) => ({ value: name, label: name }));
  const empty = { value: "", label: "Choisir…" };

  const add = () => {
    const used = new Set(phases.map((phase) => phase.color));
    set([
      ...phases,
      {
        id: crypto.randomUUID(),
        name: `Phase ${phases.length + 1}`,
        start: "",
        end: "",
        color: PHASE_COLORS.find((color) => !used.has(color)) ?? "blue",
      },
    ]);
  };

  return (
    <Popover>
      <PopoverTrigger className={cn(chip, "font-medium")}>
        <ChartGanttIcon className="size-3.5" /> Phases
        <span className="flex items-center -space-x-1">
          {phases.map((phase) => (
            <span
              key={phase.id}
              data-color={phase.color}
              className="bg-option-dot ring-background size-2.5 rounded-full ring-2"
            />
          ))}
        </span>
        {!phases.length && <span className="text-muted-foreground font-normal">aucune</span>}
      </PopoverTrigger>
      <PopoverContent className="w-[30rem] max-w-[calc(100vw-2rem)] p-3">
        <div className="mb-3 space-y-1">
          <p className="font-medium">Phases du Gantt</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Chaque phase relie une colonne de début et une colonne de fin. Une phase sans l'une des deux dates n'est pas
            dessinée ; une ligne sans aucune phase complète n'apparaît pas.
          </p>
        </div>
        <div className="space-y-2">
          {phases.map((phase) => (
            <div key={phase.id} className="space-y-2 rounded-xl border p-2.5">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    aria-label={`Couleur de ${phase.name}`}
                    data-color={phase.color}
                    className="bg-option grid size-8 shrink-0 place-items-center rounded-lg outline-none"
                  >
                    <span className="bg-option-dot size-3 rounded-full" />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {OPTION_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          data-color={color}
                          aria-label={color}
                          onClick={() => update(phase.id, { color })}
                          className={cn(
                            "bg-option grid size-7 place-items-center rounded-md",
                            color === phase.color && "ring-foreground/60 ring-2",
                          )}
                        >
                          <span className="bg-option-dot size-2.5 rounded-full" />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Input
                  aria-label="Nom de la phase"
                  value={phase.name}
                  className="h-8"
                  onChange={(event) => update(phase.id, { name: event.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Supprimer la phase ${phase.name}`}
                  onClick={() => set(phases.filter((p) => p.id !== phase.id))}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid size-8 shrink-0 place-items-center rounded-lg"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["start", "end"] as const).map((bound) => (
                  <div key={bound} className="space-y-1">
                    <span className="text-muted-foreground text-xs">{bound === "start" ? "Début" : "Fin"}</span>
                    <SimpleSelect
                      aria-label={`${bound === "start" ? "Début" : "Fin"} de ${phase.name}`}
                      value={phase[bound]}
                      onChange={(value) => update(phase.id, { [bound]: value })}
                      options={[...(phase[bound] ? [] : [empty]), ...columnOptions]}
                      className="h-8! w-full text-[13px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={add}
            className="hover:bg-muted/60 flex h-8 items-center gap-1.5 rounded-lg border border-dashed px-2.5 text-[13px]"
          >
            <PlusIcon className="size-3.5" /> Ajouter une phase
          </button>
          <button
            type="button"
            onClick={() => setViewState({ phases: undefined })}
            className="text-muted-foreground hover:text-foreground ml-auto flex h-8 items-center gap-1.5 px-1 text-[13px]"
          >
            <WandSparklesIcon className="size-3.5" /> Détecter depuis les noms de colonnes
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
