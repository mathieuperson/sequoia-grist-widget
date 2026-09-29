# Hiérarchie des structures et liens entre projets — mise en place dans Grist

Ce guide décrit, dans l'ordre, les modifications à faire dans le document Grist
pour que les widgets (`crm.html`, `pilotage.html`, `espace.html`) gèrent :

- **structures** : filiale → groupe, équipe → laboratoire (colonne `Parent`),
  laboratoire → établissements de tutelle (colonne `Tutelles`) ;
- **projets** (table `Opportunites`) : une CIFRE *dans le cadre* d'une chaire
  (colonne `Cadre`), une CIFRE qui *fait suite* à un stage (colonne `Suite_de`).

Rien n'est cassé tant que les colonnes n'existent pas : chaque étape peut être
faite indépendamment, et les widgets s'adaptent dès que la colonne apparaît.

---

## Étape 1 — Structures : ajouter les trois colonnes

Page de la table **STRUCTURES** → clic sur `+` à droite des en-têtes → *Ajouter une colonne*.

| Colonne (ID) | Type (panneau créateur → *Colonne*) | Réglages |
|---|---|---|
| `Parent` | **Référence** → table `Structures`, colonne affichée `nom_acteur` | — |
| `Tutelles` | **Liste de références** → table `Structures`, colonne affichée `nom_acteur` | — |
| `Niveau` | **Choix** | `Groupe`, `Filiale`, `Établissement`, `Institut`, `Laboratoire`, `Équipe`, `Entreprise`, `Autre` |

Pour chaque colonne : panneau créateur (icône à droite) → onglet **Colonne** →
*Type de colonne*. Vérifier que l'**ID** de colonne est bien `Parent`, `Tutelles`,
`Niveau` (renommer le libellé met l'ID à jour tant que « lier l'ID au libellé » est coché).

> `Parent` = appartenance (l'équipe est *dans* le labo, la filiale *dans* le groupe).
> `Tutelles` = rattachement d'un laboratoire à ses établissements (IRISA → Université
> de Rennes, INSA, CNRS, Inria…). Une structure n'a qu'un parent, mais peut avoir
> plusieurs tutelles.

## Étape 2 — Structures : renseigner les données

1. **Niveau** : partir de `recherche_structure` (Institut / Laboratoire / Équipe) et
   compléter pour les entreprises (Groupe / Filiale / Entreprise). Astuce : trier par
   `recherche_structure`, sélectionner un bloc de cellules de `Niveau`, coller la valeur.
2. **Parent** : équipes → leur labo (KERDATA, INUIT… → IRISA), filiales → leur groupe
   (Thales SIX GTS → Thales). Si le groupe n'existe pas encore comme ligne, le créer
   (ex. une ligne « Thales » avec `Niveau = Groupe`).
3. **Tutelles** : sur chaque laboratoire, ajouter les établissements.
4. Créer (si elle n'existe pas) une ligne **« Cluster SequoIA »** et y rattacher les
   contacts de l'équipe du cluster (colonne `Structures` de la table Contacts).
   C'est elle qui alimente le champ *Contact(s) cluster* des widgets.

Optionnel — une colonne formule de contrôle, pour repérer les structures « orphelines » :

```python
# Structures.Racine : le sommet de la hiérarchie (le groupe, le labo…)
r, n = rec, 0
while r.Parent and n < 10:
    r, n = r.Parent, n + 1
r
```

## Étape 3 — Brancher les colonnes dans les widgets

Pour **CRM SequoIA** et **Pilotage** (widgets posés sur `Structures`) :

1. Cliquer sur le widget → panneau créateur → onglet **Widget** (ou *Données source*).
2. Section **Colonnes mappées** : associer
   - `Rattachée à (Ref:Structures)` → `Parent`
   - `Tutelles (RefList:Structures)` → `Tutelles` *(CRM seulement)*
   - `Niveau (…)` → `Niveau`
3. **Enregistrer** la vue.

Espace SequoIA reconnaît la colonne `Niveau` par son nom, sans mappage.

Ce que ça change dans le CRM :

- **En-tête de fiche** : *Rattachée à* (fil d'Ariane), *Tutelles*, *Entités
  rattachées*, *Tutelle de* — chaque nom ouvre sa fiche.
- **Consolidation** : la fiche d'un labo montre aussi les interactions, opportunités
  et actions saisies sur ses équipes ; celle d'un établissement, celles des labos dont
  il est tutelle ; celle d'un groupe, celles de ses filiales. Une pastille « via
  KERDATA » indique d'où vient la ligne. Rien n'est recopié.
- **Popup structure** : champs *Rattachée à*, *Tutelles* et *Niveau* (le champ texte
  *Laboratoire* disparaît dès que `Parent` est mappé).
- **Popups interaction / opportunité** :
  - *Contact(s) partenaire* : seulement les contacts des structures choisies en
    *Partenaire(s)* **et de leurs sous-structures** (choisir IRISA propose aussi les
    contacts de ses équipes) ;
  - *Contact(s) cluster* : seulement les contacts de la structure **Cluster SequoIA**
    (et de ses sous-structures). Sans cette structure, tout le carnet reste proposé ;
  - sous *Partenaire(s)*, une ligne *Rattachements* propose d'un clic le labo, les
    tutelles ou le groupe des partenaires choisis.

## Étape 4 — Projets : liens entre opportunités

Page de la table **Opportunites** → ajouter :

| Colonne (ID) | Type | Réglages |
|---|---|---|
| `Cadre` | **Référence** → table `Opportunites`, colonne affichée `Sujet` | « dans le cadre de » (CIFRE → chaire) |
| `Suite_de` | **Référence** → table `Opportunites`, colonne affichée `Sujet` | « fait suite à » (CIFRE → stage) |

Aucun mappage : le CRM les reconnaît par leur nom (et vérifie qu'elles pointent bien
vers `Opportunites`). La popup opportunité gagne deux champs, et la fiche projet
affiche *Dans le cadre de*, *Fait suite à*, *Projets dans ce cadre* et *Suites*.

Colonnes formules utiles côté Grist (facultatif) :

```python
# Opportunites.Sous_projets
Opportunites.lookupRecords(Cadre=$id)

# Opportunites.Suites
Opportunites.lookupRecords(Suite_de=$id)
```

## Étape 5 — Ménage (quand tout est renseigné)

- `recherche_equipe_labo` (texte) fait doublon avec `Parent` : le pilotage lit déjà le
  labo dans le parent quand il existe. Une fois tous les parents saisis, démapper la
  colonne dans les widgets, puis la masquer ou la supprimer.
- `recherche_structure` fait doublon avec `Niveau` : même démarche.

## Formules Grist équivalentes (si besoin hors widgets)

```python
# Interactions.Structures_liees (type Liste de références → Structures) :
# partenaires + tous leurs ancêtres et tutelles
res = []
for s in $Partenaires:
    file, n = [s], 0
    while file and n < 50:
        r = file.pop(0); n += 1
        if r and r not in res:
            res.append(r)
            file += [r.Parent] + list(r.Tutelles)
res

# Structures.Interactions_consolidees (sur la fiche d'un labo / établissement)
Interactions.lookupRecords(Structures_liees=CONTAINS($id))
```
