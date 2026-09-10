# grist-fiche-partenaire

Widgets personnalisés Grist pour le CRM SequoIA (déployés via GitHub Pages).

## Widgets disponibles

| Widget | URL | Table | Accès requis |
|---|---|---|---|
| Fiche partenaire | `/index.html` | Structures | Lecture |
| Fiche contact | `/contacts.html` | Contacts | Lecture |
| Fiche interaction | `/interactions.html` | Interactions | Lecture + écriture (CR, pièces jointes) |
| Pipeline opportunités (Kanban) | `/opportunites.html` | Opportunités | Lecture + écriture (statut) |

URL de base : `https://mathieuperson.github.io/sequoia-grist-widget/`

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

Limites : ces tests ne couvrent pas le rendu visuel (mise en page, troncature de texte) ni l'intégration Grist réelle (droits d'accès, résolution de références par Grist) — seulement la logique JS des widgets.

## Notes techniques

- `common.css` / `common.js` sont partagés par tous les widgets (design, helpers de formatage, upload/téléchargement de pièces jointes via l'API REST Grist).
- Les widgets `interactions.html` et `opportunites.html` écrivent dans le document (compte-rendu markdown, pièces jointes, statut d'opportunité) via `grist.getTable().update()`.
- Le compte-rendu (CR) accepte le markdown ; coller une image l'upload automatiquement en pièce jointe Grist et l'insère dans le texte.
