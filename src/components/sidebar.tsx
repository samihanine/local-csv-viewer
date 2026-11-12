import {
  BookmarkIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  DatabaseIcon,
  FileDownIcon,
  FilePlusIcon,
  FileSpreadsheetIcon,
  FileUpIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  type LucideIcon,
  PlusIcon,
  Rows3Icon,
  ShieldCheckIcon,
  SquareKanbanIcon,
  Table2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { FileEntry, Mode } from "@/lib/workspace-store";

export const MODE_META: Record<Mode, { label: string; icon: LucideIcon }> = {
  table: { label: "Tableau", icon: Table2Icon },
  detail: { label: "Détail", icon: Rows3Icon },
  kanban: { label: "Kanban", icon: SquareKanbanIcon },
  gallery: { label: "Galerie", icon: LayoutGridIcon },
};

type FileSwitcherProps = {
  files: FileEntry[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
};

/** The select listing every known CSV, with the actions to add or forget one. */
export function FileSwitcher({ files, activeId, onSelect, onOpen, onCreate, onRemove }: FileSwitcherProps) {
  const active = files.find((file) => file.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Fichier CSV"
        className="bg-background hover:bg-muted/50 aria-expanded:bg-muted/50 focus-visible:ring-ring/50 flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left shadow-xs transition-colors outline-none focus-visible:ring-3"
      >
        <FileSpreadsheetIcon className="text-brand size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">{active?.name ?? "Choisir un fichier"}</span>
        <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width) min-w-64">
        <DropdownMenuLabel>Fichiers CSV</DropdownMenuLabel>
        {files.map((file) => (
          <DropdownMenuItem key={file.id} onClick={() => onSelect(file.id)}>
            <FileSpreadsheetIcon />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            {file.id === activeId && <CheckIcon />}
          </DropdownMenuItem>
        ))}
        {files.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={onOpen}>
          <FolderOpenIcon /> Ouvrir un CSV…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreate}>
          <FilePlusIcon /> Créer un CSV…
        </DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(active.id)}>
              <Trash2Icon /> Retirer « {active.name} » de la liste
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({
  icon: Icon,
  label,
  active,
  count,
  onClick,
  onRemove,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "text-foreground/70 hover:bg-muted/70 hover:text-foreground focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors outline-none focus-visible:ring-3",
          active && "bg-muted text-foreground font-medium",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className={cn("text-muted-foreground text-xs tabular-nums", onRemove && "group-hover:invisible")}>
            {count}
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Supprimer la vue ${label}`}
          onClick={onRemove}
          className="text-muted-foreground hover:bg-background hover:text-destructive absolute top-1.5 right-1.5 hidden size-6 place-items-center rounded-md group-hover:grid focus-visible:grid"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground px-2.5 pb-1 text-[11px] font-medium tracking-wider uppercase">{title}</p>
      {children}
    </div>
  );
}

type SidebarProps = FileSwitcherProps & {
  entry: FileEntry | undefined;
  ready: boolean;
  rowCount: number;
  onNewRow: () => void;
  onApplyView: (id: string | undefined) => void;
  onDeleteView: (id: string) => void;
  onSchema: () => void;
  onImport: () => void;
  onExport: () => void;
};

export function Sidebar(props: SidebarProps) {
  const { entry, ready, rowCount, onNewRow, onApplyView, onDeleteView, onSchema, onImport, onExport, ...files } = props;
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r p-4 max-md:hidden">
      <div className="space-y-2">
        <FileSwitcher {...files} />
        <button
          type="button"
          disabled={!ready}
          onClick={onNewRow}
          className="bg-background hover:bg-muted/50 focus-visible:ring-ring/50 flex h-10 w-full items-center gap-2 rounded-xl border px-3 font-medium shadow-xs transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
        >
          <PlusIcon className="size-4" /> Nouvelle ligne
        </button>
      </div>

      {entry && ready && (
        <>
          <Section title="Vues">
            <Item
              icon={DatabaseIcon}
              label="Toutes les lignes"
              active={!entry.activeViewId}
              count={rowCount}
              onClick={() => onApplyView(undefined)}
            />
            {entry.views.map((view) => (
              <Item
                key={view.id}
                icon={MODE_META[view.state.mode]?.icon ?? BookmarkIcon}
                label={view.name}
                active={view.id === entry.activeViewId}
                onClick={() => onApplyView(view.id)}
                onRemove={() => onDeleteView(view.id)}
              />
            ))}
            {!entry.views.length && (
              <p className="text-muted-foreground px-2.5 py-1 text-xs leading-relaxed">
                Réglez filtres et affichage, puis « Enregistrer la vue » pour la retrouver ici.
              </p>
            )}
          </Section>

          <Section title="Données">
            <Item icon={Columns3Icon} label="Schéma des colonnes" onClick={onSchema} />
            <Item icon={FileUpIcon} label="Importer CSV / XLSX" onClick={onImport} />
            <Item icon={FileDownIcon} label="Exporter en XLSX" onClick={onExport} />
          </Section>
        </>
      )}

      <p className="text-muted-foreground mt-auto flex items-start gap-2 px-1 text-xs leading-relaxed">
        <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
        Tout reste sur cet ordinateur : aucune donnée n'est envoyée sur Internet.
      </p>
    </aside>
  );
}
