# Espace Finance — ce qu'on en attend

Suivi budgétaire du Cluster SequoIA dans Grist, alimenté par les exports SIFAC.
Onglet **Finance** du widget *Espace SequoIA* (`espace.html`).

Ce document décrit le service rendu, le circuit de travail, les règles de calcul et
les points à valider avec l'administration. Il sert de référence commune entre la
personne qui fait le suivi budgétaire et celle qui maintient le widget.

---

## 1. Pourquoi

Aujourd'hui, suivre le budget d'un PFI suppose d'extraire SIFAC, de retravailler
l'export dans un tableur, puis de le rapprocher à la main du budget prévu. L'espace
Finance fait ce travail dans le document Grist du Cluster, à côté des projets et des
partenaires :

- **savoir où on en est** à tout moment : prévu, engagé, facturé, payé, reste à
  engager, par exercice et par catégorie ;
- **ventiler les dépenses** sur les lignes budgétaires du Cluster (et, si utile, sur
  un projet), une fois pour toutes : le tri survit aux réimports ;
- **recouper SIFAC** : les écritures brutes restent consultables, avec des totaux
  qui correspondent à un relevé SIFAC de l'exercice ;
- **repérer les anomalies** : dépassements, dépenses non ventilées, flux disparus de
  SIFAC.

## 2. Pour qui

| Rôle | Usage |
|---|---|
| Responsable administratif·ve | Import SIFAC mensuel, ventilation des dépenses, saisie des lignes budgétaires, dépenses hors SIFAC. |
| Direction / chargé·e de mission | Lecture de la synthèse : consommation, reste à engager, dépassements. |
| Porteur·se de projet | Consultation des dépenses rattachées à son projet (si l'accès lui est ouvert). |

## 3. Circuit de travail

1. **Mise en place (une fois)** — dans l'onglet Finance, bouton *Créer les tables
   manquantes*. Trois tables sont ajoutées au document (voir § 5). Rien d'existant
   n'est modifié.
2. **Budget de l'exercice (une fois par an, puis au fil des décisions)** — dans
   *Synthèse*, saisir les lignes budgétaires : libellé, catégorie, montant prévu,
   financeur. Exemple : « Personnel — ingénieur & post-doc », 60 000 €, ANR.
3. **Import SIFAC (chaque mois, ou avant un point budgétaire)** — dans *Import SIFAC*,
   déposer l'export des dépenses d'**un** PFI pour **un** exercice (.xlsx ou .csv).
   L'aperçu indique le PFI, l'exercice deviné (modifiable), le nombre d'écritures et
   ce qui va être créé, mis à jour ou signalé. Rien n'est écrit avant *Importer*.
4. **Ventilation** — la synthèse signale les dépenses *à trier*. Dans *Dépenses*,
   choisir pour chacune sa ligne budgétaire (et son projet si pertinent).
5. **Dépenses hors SIFAC** — un devis signé, une mission à venir : *+ Dépense
   manuelle*. Elles comptent dans la synthèse et ne sont jamais touchées par un import.
6. **Lecture** — *Synthèse* pour l'état de l'exercice ; *Écritures SIFAC* pour
   recouper un chiffre avec SIFAC ; un clic sur une dépense ouvre sa fiche (écritures
   qui la composent, notes).

## 4. Ce que montre chaque vue

**Synthèse** (par exercice, et par PFI s'il y en a plusieurs)
- Indicateurs : budget prévu, engagé (dont reports), facturé, payé, reste à engager.
- Courbe de consommation : engagé et payé cumulés mois par mois, face au budget.
- Par catégorie (Personnel / Fonctionnement / Investissement) : prévu, engagé, payé.
- Lignes budgétaires : prévu, engagé, payé, reste, taux de consommation (orange au-delà
  de 90 %, rouge au-delà de 100 %).
- Principaux fournisseurs.
- Alertes : dépenses non ventilées, dépenses absentes du dernier import.

**Dépenses** — une ligne par flux SIFAC (une commande), tous exercices confondus.
Filtres : statut, catégorie, « à trier », « absentes de SIFAC ». Ventilation directe
dans le tableau. Total en pied de tableau.

**Écritures SIFAC** — les lignes brutes de l'export de l'exercice, telles quelles.
C'est la vue à utiliser pour recouper un total avec SIFAC.

**Import SIFAC** — dépôt du fichier, aperçu, import.

## 5. Données

Trois tables, créées par le widget. Leurs identifiants de colonnes ne doivent pas être
renommés (les libellés, si).

**Budget_lignes** — le budget prévu.
`Libelle`, `Exercice`, `Categorie` (Personnel / Fonctionnement / Investissement),
`Montant_prevu`, `Financeur`, `PFI`, `Notes`.

**Depenses** — une ligne par flux SIFAC, ou par dépense manuelle.
Réécrits à chaque import : `Flux`, `Libelle`, `Fournisseur`, `Code_tiers`, `Compte`,
`Libelle_compte`, `Categorie`, `Statut` (Engagé / Livré / Payé), `Montant`,
`Montant_engage`, `Montant_facture`, `Montant_paye`, `Date_engagement`,
`Date_facture`, `Date_paiement`, `PFI`, `OTP`, `Source` (SIFAC / Manuelle),
`Orpheline`.
**Jamais réécrits** (le tri fait à la main) : `Budget_ligne`, `Opportunite` (projet),
`Notes`.

**Sifac_lignes** — les écritures brutes, par PFI et exercice.
`PFI`, `Exercice`, `Flux`, `Libelle_flux`, `Rubrique`, `Tiers`, `Code_tiers`,
`Compte`, `Libelle_compte`, `Compte_execution`, `OTP`, `Date_engagement`,
`Montant_engage`, `Montant_service_fait`, `Date_service_fait`, `Num_facture`,
`Date_facture`, `Montant_facture`, `Montant_paye`, `Date_paiement`, `Report`.

## 6. Règles de calcul

**Lecture du fichier.** Les colonnes sont reconnues par le début de leur intitulé
(SIFAC tronque à 30 caractères) ; l'en-tête peut être précédé de lignes de titre. Les
lignes sans numéro de flux (sous-totaux) sont ignorées. Colonnes indispensables :
PFI, numéro de flux, montant engagé HTR, montant facturé HTR, montant payé. Un fichier
qui mélange plusieurs PFI est refusé.

**Exercice.** Il n'est pas écrit dans l'export : le widget propose l'année la plus
fréquente parmi les dates de facture, de paiement ou d'engagement. À vérifier dans
l'aperçu.

**Remplacement.** Importer un PFI sur un exercice remplace toutes ses écritures de cet
exercice ; les autres exercices et les autres PFI ne bougent pas. L'import se fait en
une seule opération : en cas d'échec, rien n'est modifié.

**Dépenses.** Les écritures sont regroupées par numéro de flux, **tous exercices
confondus** : une commande engagée en N−1 et payée en N reste une seule dépense.
- Statut : *Payé* quand les paiements soldent la facture (ou, sans facture — la paie —,
  l'engagement) ; *Livré* quand il existe une facture ; *Engagé* sinon.
- Montant de référence : celui de l'état atteint (payé, sinon facturé, sinon engagé).
- Catégorie, selon le compte d'exécution budgétaire : `FG` → Fonctionnement,
  `IG` → Investissement, tout le reste (y compris la paie sans code) → Personnel.
- Un **report** (engagement de l'exercice précédent qui se poursuit) compte comme
  engagé.

**Rapprochement.** Une dépense SIFAC est retrouvée par son numéro de flux (et son PFI).
Si un flux disparaît de SIFAC, la dépense n'est **pas supprimée** : elle est marquée
*absente du dernier import* pour vérification.

**Synthèse d'un exercice.** Calculée sur les écritures de l'exercice (exactes année par
année), plus les dépenses manuelles datées de l'exercice. La consommation d'une ligne
budgétaire est la somme des dépenses qui y sont ventilées.

> Les deux vues ne donnent pas les mêmes totaux, et c'est normal : *Dépenses* cumule
> une commande sur tous ses exercices, *Écritures SIFAC* ne compte que l'exercice
> affiché. Pour recouper SIFAC, utiliser *Écritures SIFAC*.

## 7. Confidentialité

Les écritures de paie désignent souvent une personne identifiable (un salaire
d'ingénieur, de post-doctorant). **Avant d'importer**, restreindre l'accès aux tables
`Depenses` et `Sifac_lignes` dans les règles d'accès Grist (onglet *Règles d'accès* du
document) aux seules personnes qui font le suivi budgétaire. Le widget n'ajoute aucune
protection propre : il voit ce que la personne connectée a le droit de voir.

## 8. Points à valider avec l'administration

1. **Format de l'export** : quel état SIFAC exporter (celui utilisé ici suit les
   intitulés « Numéro de flux », « Montant engagé HTR », « Montant facturé HTR »,
   « Montant payé », « Compte d'exécution budgétaire »…) ? Un exemple réel permettra de
   confirmer la reconnaissance des colonnes.
2. **HT ou TTC** : les montants suivis sont HT (HTR). Est-ce la bonne base pour le
   budget du Cluster ?
3. **Reports** : faut-il les compter dans l'engagé de l'exercice qui les reçoit (choix
   actuel) ou à part ?
4. **Catégories** : la répartition Personnel / Fonctionnement / Investissement
   suffit-elle, ou faut-il descendre au niveau des comptes ?
5. **Frais de gestion / préciput** : à prévoir comme une ligne budgétaire à part ?
6. **Plusieurs PFI** : le Cluster en a-t-il plusieurs (par financeur) ? La synthèse sait
   filtrer par PFI.
7. **Fréquence d'import** et personne responsable.
8. **Accès** : qui voit la synthèse, qui voit le détail (cf. § 7).

## 9. Hors périmètre (pour l'instant)

- Connexion directe à SIFAC : l'import reste manuel, par fichier.
- Recettes (versements des financeurs) et trésorerie.
- Prévisionnel de dépenses au-delà des dépenses manuelles.
- Export comptable ou rapport financier au format d'un financeur.
