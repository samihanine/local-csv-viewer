# Local CSV Viewer

Ouvre un fichier CSV de l'ordinateur et permet de le consulter et de le modifier comme une petite base de données.
Chaque modification est écrite immédiatement dans le fichier. Rien n'est envoyé sur Internet.

Basé sur le template [react-sandbox](https://github.com/samihanine/react-sandbox) :
React + TypeScript + Vite + Tailwind + shadcn/ui (Base UI) + Bun.

## Fonctionnalités

- **Fichiers** : choix d'un CSV avec accès en lecture et écriture, plusieurs fichiers mémorisés, changement via le sélecteur.
- **Écriture en direct** : l'interface se met à jour tout de suite, le fichier suit ; si l'écriture échoue, la modification est annulée. Un fichier modifié par un autre programme est rechargé.
- **Affichages** : tableau éditable, fiche détaillée avec formulaire, kanban (glisser-déposer, colonne de regroupement au choix), galerie.
- **Filtres** sur chaque colonne, recherche globale, tri, ordre et visibilité des colonnes, et **vues enregistrées** (affichage + filtres + tri + regroupement + colonnes).
- **Schéma** par fichier : texte court, texte long (markdown), date, options colorées. Détection automatique des types, export et import du schéma en JSON.
- **Export XLSX** mis en forme : un tableau Excel en A1, bordures, retour à la ligne, hauteur de ligne uniforme, largeur selon le type.
- **Import CSV / XLSX** : ajout à la fin ou remplacement, avec correspondance des colonnes si elles diffèrent.

Navigateur requis : Chrome, Edge ou un autre navigateur Chromium sur ordinateur (API File System Access).

## Où sont stockées les données

| Donnée                                   | Emplacement                                                           |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Contenu du CSV                           | Le fichier lui-même, sur le disque                                    |
| Liste des fichiers, schémas, vues, thème | `localStorage`                                                        |
| Accès aux fichiers (handles)             | IndexedDB : le navigateur ne permet pas de les mettre en localStorage |

## Commandes

| Commande              | Effet                                                        |
| --------------------- | ------------------------------------------------------------ |
| `bun install`         | Installe les dépendances                                     |
| `bun dev`             | Serveur de développement sur http://localhost:5173           |
| `bun run build:html`  | Construit **un seul fichier** : `dist-html/index.html`       |
| `bun run build`       | Build classique dans `dist/`                                 |
| `bun run format`      | Corrige le style, trie les imports et les classes Tailwind   |
| `bun run check`       | Typage + lint + tests + build, à lancer avant de partager    |
| `bun run audit`       | Liste les dépendances ayant une vulnérabilité connue         |
| `bun run deps:update` | Met à jour les dépendances, annule si une vérification casse |

## Structure

```
src/
  app.tsx                 Mise en page, barre du haut, onglets d'affichage
  components/
    views/                Tableau, détail, kanban, galerie
    sidebar.tsx           Sélecteur de fichier, vues enregistrées, outils
    filter-bar.tsx        Filtres, tri, regroupement, enregistrement de vue
    columns-menu.tsx      Ordre et visibilité des colonnes de la vue
    fields.tsx            Affichage et édition d'une cellule selon son type
    markdown-editor.tsx   Éditeur de texte long
    schema-dialog.tsx     Schéma des colonnes
    import-dialog.tsx     Import CSV / XLSX
    ui/                   Composants shadcn/ui
  lib/                    Logique sans interface, testée (*.test.ts)
    csv.ts                Lecture / écriture CSV (séparateur, fins de ligne et BOM conservés)
    files.ts              Accès aux fichiers du disque
    use-workspace.ts      État de l'application et file d'écriture
    workspace-store.ts    Persistance localStorage
    schema.ts             Types de colonnes, détection, schéma JSON
    query.ts              Recherche, filtres, tri
    xlsx.ts               Génération du classeur Excel
    import.ts             Lecture des fichiers importés et correspondance des colonnes
    markdown.tsx          Rendu markdown
```

## Sécurité

- La page construite porte une Content-Security-Policy qui bloque toute requête réseau : les données ne peuvent pas sortir de l'ordinateur.
- Le markdown est rendu en éléments React, jamais en HTML injecté ; seuls les liens `http(s)` et `mailto` sont cliquables.
- L'export XLSX écrit du texte, jamais de formule : une cellule commençant par `=` ne peut pas s'exécuter dans Excel.
- Les schémas JSON importés sont validés champ par champ.
- L'écriture passe par un fichier temporaire : le CSV n'est remplacé qu'une fois le nouveau contenu complet.
- `bunfig.toml` refuse les paquets publiés depuis moins de 3 jours, `bun.lock` fige les versions, les scripts d'installation des dépendances ne s'exécutent pas.
- Dependabot et la CI (`.github/`) lancent l'audit et les vérifications.

Pour signaler une vulnérabilité, voir `SECURITY.md`.
