# grist-fiche-partenaire

Widgets personnalisés Grist pour le CRM SequoIA (déployés via GitHub Pages).

## Widgets disponibles

| Widget | URL | Table | Accès requis |
|---|---|---|---|
| **CRM SequoIA — fiche 360** | `/crm.html` | Structures | Complet (lit et écrit Contacts / Interactions / Opportunités) |
| Fiche partenaire | `/index.html` | Structures | Lecture |
| Fiche contact | `/contacts.html` | Contacts | Lecture |
| Fiche interaction | `/interactions.html` | Interactions | Lecture + écriture (CR, pièces jointes) |
| Pipeline opportunités (Kanban) | `/opportunites.html` | Opportunités | Lecture + écriture (statut) |
| Dashboard financement CIFRE | `/cifre-financement.html` | Thèses (ou toute table de thèses doctorales) | Lecture |

URL de base : `https://mathieuperson.github.io/sequoia-grist-widget/`

### CRM SequoIA — fiche 360 (`crm.html`)

Vue de travail unique qui remplace la page à quatre widgets : une structure sélectionnée dans la liste de gauche
affiche sa fiche, ses indicateurs (dernier contact, nombre d'interactions, opportunités et montant cumulé,
prochaine action), ses contacts, ses opportunités et l'historique de ses échanges — dernier compte-rendu déplié
avec ses pièces jointes.

Tout se modifie depuis cette vue, dans des popups : fiche structure, fiche contact, opportunité (statut compris),
et interaction avec l'éditeur de compte-rendu (gras/italique/titre/liste/lien, collage d'image téléversée
automatiquement) et le dépôt de pièces jointes. Les enregistrements créés sont rattachés d'office à la structure
ouverte, donc jamais orphelins. Chaque champ s'enregistre seul, avec un retour visible ("Enregistrement…" /
"Enregistré ✓").

Une structure apparaît dans sa fiche dès qu'une ligne la référence, **quelle que soit la colonne** : une
interaction saisie depuis la fiche d'un partenaire mais qui cite un laboratoire en « Laboratoire Cluster »
remonte aussi sur la fiche de ce laboratoire, avec une pastille indiquant par quel champ elle est rattachée.
Les colonnes de référence sont découvertes à la lecture du type Grist (`Ref:Structures` / `RefList:Structures`).

Particularité technique : un widget Grist n'est mappé que sur **une** table (ici Structures). Les trois autres
tables sont lues via `docApi.fetchTable` et écrites via `docApi.applyUserActions`, et leurs colonnes sont
**résolues par leur nom** (accents, tirets bas et variantes ignorés : `Nom_Complet`, `Compte_rendu`,
`Date_interaction`… sont reconnus). Une table absente est signalée dans le panneau concerné sans casser le reste
de la fiche. Le bouton ↻ en bas de la liste recharge les tables liées (utile si quelqu'un d'autre a modifié le
document).

### Dashboard financement CIFRE

Regroupe les thèses CIFRE par **Université > Entreprise partenaire** : nombre de CIFRE, montant total, et
répartition monétaire (salaire doctorant + contrat) / in-kind (encadrement entreprise) **par année**, réparties à
parts égales sur la durée de la thèse (200k€/3 ans par défaut — 120k doctorant + 40k contrat en monétaire, 40k
d'encadrement en in-kind). Montants affichés en k€. Export CSV (en euros bruts), filtres multi-sélection (Université
/ Entreprise / Laboratoire / Année de début, chacun un menu à cases à cocher avec recherche), vue Graphique (barres
par année, regroupables par Université ou Entreprise — plafonné aux 6 catégories les plus importantes + "Autres"
pour rester lisible, total affiché au sommet des barres empilées), et paramètres (montants, durée par défaut)
éditables et persistés dans le document via `grist.setOption`/`getOption`. Une ligne de diagnostic (lignes reçues de
Grist / après filtres / comptées comme CIFRE) aide à repérer si un écart de comptage vient d'un filtre Grist en
amont (Filtre ou Sélectionné par sur la section du widget) plutôt que du widget lui-même ; un bandeau liste aussi les
valeurs exclues (avec leur nombre) dès que le champ "Financement CIFRE" est mappé, pour repérer d'un coup d'œil une
valeur qui devrait compter mais ne compte pas.

Colonnes attendues sur la table source (mappage Grist classique) : Université, Entreprise partenaire, Date de
début de thèse. Optionnelles : un champ "Financement CIFRE (oui/non)" pour filtrer si la table contient aussi des
thèses non-CIFRE (sinon toutes les lignes sont comptées), une durée en années si différente de 3, un montant total
si différent de 200k€ pour une thèse donnée.

## Mise en place dans Grist

1. Créer/ouvrir la vue, ajouter un widget **Personnalisée** relié à la bonne table.
2. Coller l'URL du widget dans **Widget → URL personnalisée**.
3. Régler **Niveau d'accès** sur "Lecture des données du document" (ou accepter la demande d'accès affichée dans le panneau, y compris en écriture pour Interactions/Opportunités).
4. Une section **Colonnes mappées** apparaît dans le panneau du widget : associer chaque rôle (ex. "Nom", "Date", "CR"...) à la colonne réelle de la table. C'est ce mapping qui rend les widgets indépendants du nommage exact des colonnes.

## Tests

`tests/common.test.mjs` couvre les fonctions pures de `common.js` (formatage, mapping, dates, couleurs de statut) et inclut un test de non-régression sur l'autosave par champ. Lancer avec :

```
node tests/common.test.mjs
```

Aucune dépendance, aucun accès Grist nécessaire — ces tests ne couvrent pas les widgets eux-mêmes (qui exigent un vrai document Grist), voir la recette manuelle pour ça.

### Tests navigateur (simulent Grist, sans document réel)

`tests/browser/` charge chaque widget dans un vrai navigateur (Playwright) avec un faux `window.grist` (`tests/browser/mock-grist.mjs`) qui simule un document Grist en mémoire : listes/fiches, mapping des colonnes, écriture (`create`/`update`), liste de choix d'une colonne (`Choice`), et le filtrage "Sélectionné par" entre Structures et Interactions. Objectif : rejouer les scénarios de création/édition (ex. créer une interaction liée à un partenaire, changer un champ Choix, sauvegarder une date) et détecter les régressions côté code avant de tester en vrai dans Grist.

```
npm install
npx playwright install chromium   # une seule fois
npm run test:browser
```

Dans un environnement sans accès réseau pour télécharger Chromium, pointer `PLAYWRIGHT_CHROMIUM_PATH` vers un binaire déjà installé.

Le faux document simule aussi `docApi.applyUserActions` (AddRecord / UpdateRecord / RemoveRecord) et les points
d'entrée REST des pièces jointes, ce dont `crm.html` a besoin pour écrire dans des tables sur lesquelles il n'est
pas mappé. Les jeux de données sont dans `tests/browser/fixtures.mjs`.

Limites : ces tests ne couvrent pas le rendu visuel (mise en page, troncature de texte) ni l'intégration Grist réelle (droits d'accès, résolution de références par Grist) — seulement la logique JS des widgets.

### Aperçu visuel (captures, sans Grist)

`npm run preview` ouvre `crm.html` avec le même faux document et enregistre des captures dans
`tests/browser/screenshots/` (fiche, popup structure, popup interaction, vue étroite). Sert à vérifier la mise en
page — ce que les tests ci-dessus ne font pas — avant de brancher le widget dans Grist.

```
npm run preview
npm run preview -- --width 1200
```

## Notes techniques

- `common.css` / `common.js` sont partagés par tous les widgets (design, helpers de formatage, upload/téléchargement de pièces jointes via l'API REST Grist).
- Les widgets `interactions.html` et `opportunites.html` écrivent dans le document (compte-rendu markdown, pièces jointes, statut d'opportunité) via `grist.getTable().update()`.
- `crm.html` écrit dans plusieurs tables via `grist.docApi.applyUserActions()` (helpers `addRecord` / `updateRecord` / `removeRecord` de `common.js`) et résout leurs colonnes avec `resolveColumns()`.
- Le compte-rendu (CR) accepte le markdown ; coller une image l'upload automatiquement en pièce jointe Grist et l'insère dans le texte.
