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

## Notes techniques

- `common.css` / `common.js` sont partagés par tous les widgets (design, helpers de formatage, upload/téléchargement de pièces jointes via l'API REST Grist).
- Les widgets `interactions.html` et `opportunites.html` écrivent dans le document (compte-rendu markdown, pièces jointes, statut d'opportunité) via `grist.getTable().update()`.
- Le compte-rendu (CR) accepte le markdown ; coller une image l'upload automatiquement en pièce jointe Grist et l'insère dans le texte.
