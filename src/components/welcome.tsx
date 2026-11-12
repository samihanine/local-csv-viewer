import {
  FilePlusIcon,
  FileSpreadsheetIcon,
  FileXIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  Loader2Icon,
  type LucideIcon,
  MonitorXIcon,
  PencilIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupported } from "@/lib/files";

function Screen({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto p-8 text-center">
      <div className="from-brand shadow-brand/25 grid size-14 place-items-center rounded-2xl bg-linear-to-b to-[oklch(0.55_0.2_265)] text-white shadow-lg">
        <Icon className="size-7" />
      </div>
      <h1 className="max-w-md text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {children}
    </div>
  );
}

const POINTS = [
  {
    icon: ZapIcon,
    title: "Écriture en direct",
    text: "Chaque modification est enregistrée dans le fichier, sans bouton « Sauver ».",
  },
  {
    icon: PencilIcon,
    title: "Quatre affichages",
    text: "Tableau éditable, fiche détaillée, kanban et galerie, avec filtres et vues enregistrées.",
  },
  {
    icon: ShieldCheckIcon,
    title: "100 % local",
    text: "Le fichier ne quitte jamais votre ordinateur. Aucun compte, aucun serveur.",
  },
];

export function Welcome({ onOpen, onCreate }: { onOpen: () => void; onCreate: () => void }) {
  if (!isSupported())
    return (
      <Screen icon={MonitorXIcon} title="Ce navigateur ne peut pas modifier vos fichiers">
        <p className="text-muted-foreground max-w-md">
          L'application écrit directement dans le CSV grâce à l'API « File System Access », disponible dans Chrome, Edge
          et les navigateurs basés sur Chromium, sur ordinateur.
        </p>
      </Screen>
    );

  return (
    <Screen icon={FileSpreadsheetIcon} title="Ouvrez un CSV, modifiez-le comme une base de données">
      <p className="text-muted-foreground max-w-md">
        Choisissez un fichier sur votre ordinateur : vous lui donnez un accès en lecture et en écriture, et il est
        mémorisé pour la prochaine fois.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onOpen}>
          <FolderOpenIcon /> Choisir un fichier CSV
        </Button>
        <Button variant="outline" onClick={onCreate}>
          <FilePlusIcon /> Créer un CSV vide
        </Button>
      </div>
      <div className="mt-6 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
        {POINTS.map((point) => (
          <div key={point.title} className="rounded-xl border p-4">
            <point.icon className="text-brand mb-3 size-4" />
            <p className="font-medium">{point.title}</p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{point.text}</p>
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function Loading() {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center gap-2">
      <Loader2Icon className="size-4 animate-spin" /> Ouverture du fichier…
    </div>
  );
}

export function NeedsPermission({ name, onGrant }: { name: string; onGrant: () => void }) {
  return (
    <Screen icon={KeyRoundIcon} title={`Autoriser l'accès à « ${name} »`}>
      <p className="text-muted-foreground max-w-md">
        Par sécurité, le navigateur redemande votre accord avant de rouvrir un fichier. Choisissez « Autoriser à chaque
        visite » pour ne plus voir cette étape.
      </p>
      <Button onClick={onGrant}>
        <KeyRoundIcon /> Autoriser la lecture et l'écriture
      </Button>
    </Screen>
  );
}

export function Missing({ name, onOpen, onRemove }: { name: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <Screen icon={FileXIcon} title={`« ${name} » est introuvable`}>
      <p className="text-muted-foreground max-w-md">
        Le fichier a peut-être été déplacé, renommé ou supprimé. Sélectionnez-le à nouveau pour retrouver son schéma et
        ses vues.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onOpen}>
          <FolderOpenIcon /> Retrouver le fichier
        </Button>
        <Button variant="outline" onClick={onRemove}>
          Retirer de la liste
        </Button>
      </div>
    </Screen>
  );
}
