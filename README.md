# Local CSV Viewer

Ouvre un fichier CSV de l'ordinateur et permet de le consulter et de le modifier comme une petite base de données.
Chaque modification est écrite immédiatement dans le fichier. Rien n'est envoyé sur Internet.

Basé sur le template [react-sandbox](https://github.com/samihanine/react-sandbox) :
React + TypeScript + Vite + Tailwind + shadcn/ui (Base UI) + Bun.

## Fonctionnalités

- **Fichiers** : choix d'un CSV avec accès en lecture et écriture, plusieurs fichiers mémorisés, changement via le sélecteur.
- **Enregistrement manuel** : les modifications (lignes et schéma) restent en brouillon jusqu'au bouton « Enregistrer » (ou Ctrl+S) ; « Annuler » revient au dernier état enregistré.
- **Recharger** : relit le fichier depuis le disque. Un changement fait par un autre programme est signalé sur le bouton.
- **Affichages** : tableau éditable, kanban (glisser-déposer, colonne de regroupement au choix), galerie et Gantt.
- **Panneau de détail** : un clic sur une ligne, une carte ou une barre ouvre son formulaire à droite ; un second clic, la croix ou Échap le referme. Sa largeur se règle à la souris (ou aux flèches) et est mémorisée pour toute l'app.
- **Adresse partageable** : l'URL (après `#`) contient l'outil, le fichier, la vue et ses réglages ; plusieurs onglets peuvent montrer des vues différentes, et un lien peut être rouvert tel quel. Un lien invalide est signalé et ses parties erronées ignorées. Fonctionne aussi depuis `dist-html/index.html`.
- **Gantt** : un tableau à deux colonnes, le titre de chaque ligne puis sa frise (qui prend toute la largeur restante), une ligne par tâche ; des phases (colonne de début, colonne de fin, couleur) réglées dans la barre de filtres, devinées depuis les noms de colonnes (`test_start_date` / `test_end_date`…). Une phase sans ses deux dates n'est pas dessinée, une ligne sans phase complète n'apparaît pas.
- **Filtres** sur chaque colonne (avec « Tout sélectionner » pour les options), recherche globale, tri, colonnes masquées, et **vues enregistrées** (affichage + filtres + tri + regroupement + colonnes + phases).
- **Schéma** par fichier : texte court, texte long (markdown), date, options colorées (triées par ordre alphabétique), identifiant. Ordre des colonnes, colonne titre (étoile, affichée en gras), détection automatique des types, export et import du schéma en JSON.
- **Parent** : un type de colonne qui pointe vers l'identifiant d'une autre ligne. La ligne enfant reprend automatiquement les valeurs de son parent (sauf le titre) là où ses cellules sont vides ; ces valeurs héritées sont grisées et restent modifiables. Dans le tableau, les sous-lignes sont rangées sous leur parent, décalées vers la droite, et repliables.
- **Identifiants** : texte du type `T-001`, avec préfixe et nombre minimum de chiffres ; chaque nouvelle ligne reçoit le plus grand numéro + 1.
- **Export XLSX** : une feuille et une table Excel nommées `data` en A1 (triables et filtrables), bordures, retour à la ligne, hauteur de ligne uniforme, largeur selon le type (texte long et colonne titre deux fois plus larges), titre en gras ; les colonnes à options ont une liste déroulante et une couleur de fond par option.
- **Lecteur Excel** (onglet vert du rail) : déposez un `.xlsx`, sa première feuille s'affiche en tableau ; « Télécharger le Excel » rend un classeur brut (valeurs seules, sans mise en forme), « Copier sans l'en-tête » copie toutes les lignes sauf la première, prêtes à coller dans Excel.
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
    views/                Tableau, kanban, galerie, Gantt, panneau de détail
    sidebar.tsx           Sélecteur de fichier, vues enregistrées, outils
    filter-bar.tsx        Filtres, tri, regroupement, enregistrement de vue
    columns-menu.tsx      Colonnes masquées de la vue
    phases-menu.tsx       Phases du Gantt
    parent-field.tsx      Choix et affichage d'une ligne parente
    fields.tsx            Affichage et édition d'une cellule selon son type
    markdown-editor.tsx   Éditeur de texte long
    schema-dialog.tsx     Schéma des colonnes
    excel-page.tsx        Lecteur Excel
    import-dialog.tsx     Import CSV / XLSX
    ui/                   Composants shadcn/ui
  lib/                    Logique sans interface, testée (*.test.ts)
    csv.ts                Lecture / écriture CSV (séparateur, fins de ligne et BOM conservés)
    files.ts              Accès aux fichiers du disque
    use-workspace.ts      État de l'application, brouillon et enregistrement
    workspace-store.ts    Persistance localStorage
    schema.ts             Types de colonnes, détection, schéma JSON
    query.ts              Recherche, filtres, tri
    xlsx.ts               Génération du classeur Excel
    gantt.ts              Phases et barres du Gantt
    tree.ts               Lignes parentes : héritage et arborescence
    url-state.ts          État de l'onglet dans l'adresse
    excel-tools.ts        Lecteur Excel : lecture, copie, classeur brut
    import.ts             Lecture des fichiers importés et correspondance des colonnes
    markdown.tsx          Rendu markdown
```

## Sécurité

- La page construite porte une Content-Security-Policy qui bloque toute requête réseau : les données ne peuvent pas sortir de l'ordinateur.
- Le markdown est rendu en éléments React, jamais en HTML injecté ; seuls les liens `http(s)` et `mailto` sont cliquables.
- L'export XLSX écrit du texte, jamais de formule : une cellule commençant par `=` ne peut pas s'exécuter dans Excel.
- Les schémas JSON importés sont validés champ par champ.
- L'écriture passe par un fichier temporaire : le CSV n'est remplacé qu'une fois le nouveau contenu complet. Rien n'est écrit sans clic sur « Enregistrer ».
- `bunfig.toml` refuse les paquets publiés depuis moins de 3 jours, `bun.lock` fige les versions, les scripts d'installation des dépendances ne s'exécutent pas.
- Dependabot et la CI (`.github/`) lancent l'audit et les vérifications.

Pour signaler une vulnérabilité, voir `SECURITY.md`.
