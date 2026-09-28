// Logique de l'espace Finance (onglet « Finance » d'espace.html).
//
// Suivi budgétaire du Cluster à partir des exports SIFAC (le SAP financier de
// l'université) : lecture du fichier, regroupement des écritures en dépenses,
// rapprochement avec ce qui est déjà dans le document, synthèse par exercice
// et par ligne budgétaire. Fonctions pures uniquement — ni `grist` ni DOM —,
// couvertes par tests/finance.test.mjs. Chargé après common.js.
//
// Vocabulaire :
//   - une « écriture » est une ligne brute de l'export SIFAC ;
//   - un « flux » (numéro de flux SIFAC) est une commande ou une opération :
//     plusieurs écritures (engagement, service fait, facture, paiement,
//     report d'un exercice sur l'autre) partagent le même flux ;
//   - une « dépense » est le flux vu d'un bloc : c'est elle qu'on rattache à
//     une ligne budgétaire et à un projet.

const FIN_JOUR = 86400;

// ---------------------------------------------------------------------
// Structure attendue du document
// ---------------------------------------------------------------------
// Trois tables. Le widget peut les créer d'un clic (AddTable) ; il ne crée
// jamais une colonne dans une table existante sans qu'on le lui demande.
const FIN_TABLES = {
  budget: {
    tableId: 'Budget_lignes',
    titre: 'Lignes budgétaires',
    colonnes: [
      { id: 'Libelle', type: 'Text', label: 'Libellé' },
      { id: 'Exercice', type: 'Int', label: 'Exercice' },
      { id: 'Categorie', type: 'Choice', label: 'Catégorie', choices: ['Personnel', 'Fonctionnement', 'Investissement'] },
      { id: 'Montant_prevu', type: 'Numeric', label: 'Montant prévu (€)' },
      { id: 'Financeur', type: 'Text', label: 'Financeur' },
      { id: 'PFI', type: 'Text', label: 'PFI' },
      { id: 'Notes', type: 'Text', label: 'Notes' }
    ]
  },
  depenses: {
    tableId: 'Depenses',
    titre: 'Dépenses',
    colonnes: [
      { id: 'Flux', type: 'Text', label: 'N° de flux' },
      { id: 'Libelle', type: 'Text', label: 'Libellé' },
      { id: 'Fournisseur', type: 'Text', label: 'Fournisseur' },
      { id: 'Code_tiers', type: 'Text', label: 'Code tiers' },
      { id: 'Compte', type: 'Text', label: 'Compte' },
      { id: 'Libelle_compte', type: 'Text', label: 'Libellé du compte' },
      { id: 'Categorie', type: 'Choice', label: 'Catégorie', choices: ['Personnel', 'Fonctionnement', 'Investissement'] },
      { id: 'Statut', type: 'Choice', label: 'Statut', choices: ['Engagé', 'Livré', 'Payé'] },
      { id: 'Montant', type: 'Numeric', label: 'Montant (€)' },
      { id: 'Montant_engage', type: 'Numeric', label: 'Engagé (€)' },
      { id: 'Montant_facture', type: 'Numeric', label: 'Facturé (€)' },
      { id: 'Montant_paye', type: 'Numeric', label: 'Payé (€)' },
      { id: 'Date_engagement', type: 'Date', label: "Date d'engagement" },
      { id: 'Date_facture', type: 'Date', label: 'Date de facture' },
      { id: 'Date_paiement', type: 'Date', label: 'Date de paiement' },
      { id: 'PFI', type: 'Text', label: 'PFI' },
      { id: 'OTP', type: 'Text', label: 'OTP' },
      { id: 'Source', type: 'Choice', label: 'Source', choices: ['SIFAC', 'Manuelle'] },
      { id: 'Orpheline', type: 'Bool', label: 'Absente du dernier import' },
      // Le tri fait à la main : jamais réécrit par un import.
      { id: 'Budget_ligne', type: 'Ref:Budget_lignes', label: 'Ligne budgétaire' },
      { id: 'Opportunite', type: 'Ref:Opportunites', label: 'Projet' },
      { id: 'Notes', type: 'Text', label: 'Notes' }
    ]
  },
  ecritures: {
    tableId: 'Sifac_lignes',
    titre: 'Écritures SIFAC',
    colonnes: [
      { id: 'PFI', type: 'Text', label: 'PFI' },
      { id: 'Exercice', type: 'Int', label: 'Exercice' },
      { id: 'Flux', type: 'Text', label: 'N° de flux' },
      { id: 'Libelle_flux', type: 'Text', label: 'Libellé du flux' },
      { id: 'Rubrique', type: 'Text', label: 'Rubrique' },
      { id: 'Tiers', type: 'Text', label: 'Tiers' },
      { id: 'Code_tiers', type: 'Text', label: 'Code tiers' },
      { id: 'Compte', type: 'Text', label: 'Compte' },
      { id: 'Libelle_compte', type: 'Text', label: 'Libellé du compte' },
      { id: 'Compte_execution', type: 'Text', label: "Compte d'exécution" },
      { id: 'OTP', type: 'Text', label: 'OTP' },
      { id: 'Date_engagement', type: 'Date', label: "Date d'engagement" },
      { id: 'Montant_engage', type: 'Numeric', label: 'Engagé HT (€)' },
      { id: 'Montant_service_fait', type: 'Numeric', label: 'Service fait HT (€)' },
      { id: 'Date_service_fait', type: 'Date', label: 'Date du service fait' },
      { id: 'Num_facture', type: 'Text', label: 'N° de facture' },
      { id: 'Date_facture', type: 'Date', label: 'Date de facture' },
      { id: 'Montant_facture', type: 'Numeric', label: 'Facturé HT (€)' },
      { id: 'Montant_paye', type: 'Numeric', label: 'Payé (€)' },
      { id: 'Date_paiement', type: 'Date', label: 'Date de paiement' },
      { id: 'Report', type: 'Numeric', label: 'Report (€)' }
    ]
  }
};

// Les actions Grist qui créent une table absente, avec ses colonnes.
function actionsCreationTables(manquantes) {
  return (manquantes || []).map(cle => {
    const t = FIN_TABLES[cle];
    return ['AddTable', t.tableId, t.colonnes.map(c => {
      const col = { id: c.id, type: c.type, label: c.label, isFormula: false };
      if (c.choices) col.widgetOptions = JSON.stringify({ choices: c.choices });
      return col;
    })];
  });
}

// ---------------------------------------------------------------------
// Lecture de l'export SIFAC
// ---------------------------------------------------------------------
// SIFAC tronque ses en-têtes à 30 caractères et varie les apostrophes : on
// reconnaît chaque colonne par le début de son intitulé normalisé.
// `requis` : sans elle, l'import n'a pas de sens et s'arrête.
const SIFAC_ENTETES = [
  { champ: 'pfi', debut: 'programme de financement', requis: true },
  { champ: 'flux', debut: 'numero de flux', requis: true },
  { champ: 'libelleFlux', debut: 'libelle du flux' },
  { champ: 'rubrique', debut: 'rubrique de la piece' },
  { champ: 'tiers', debut: 'nom du tiers' },
  { champ: 'codeTiers', debut: 'numero du tiers' },
  { champ: 'compte', debut: 'compte general', exclut: 'libelle' },
  { champ: 'libelleCompte', debut: 'libelle compte general' },
  { champ: 'dateEngagement', debut: 'date initiale', date: true },
  { champ: 'engage', debut: 'montant engage htr', montant: true, requis: true },
  { champ: 'serviceFait', debut: 'montant htr des sf', montant: true },
  { champ: 'dateServiceFait', debut: 'date comptable du csf', date: true },
  { champ: 'numFacture', debut: 'numero de facture' },
  { champ: 'dateFacture', debut: 'date comptable facture', date: true },
  { champ: 'facture', debut: 'montant facture htr', montant: true, requis: true },
  { champ: 'paye', debut: 'montant paye', montant: true, requis: true },
  { champ: 'datePaiement', debut: 'date de paiement', date: true },
  { champ: 'report', debut: 'report', montant: true },
  { champ: 'otp', debut: "element d'otp" },
  { champ: 'compteExecution', debut: "compte d'execution budgetaire" }
];

function normaliserEntete(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’´`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

// Associe chaque champ à sa colonne. Une colonne requise absente, ou deux
// colonnes candidates pour le même champ, arrêtent l'import : mieux vaut un
// refus clair qu'une colonne vide en silence.
function mapperEntetes(ligneEntete) {
  const norm = (ligneEntete || []).map(normaliserEntete);
  const index = {};
  const manquantes = [];
  const ambigues = [];
  const absentesOptionnelles = [];
  SIFAC_ENTETES.forEach(def => {
    const hits = [];
    norm.forEach((h, i) => {
      if (h.startsWith(def.debut) && !(def.exclut && h.startsWith(def.exclut))) hits.push(i);
    });
    if (hits.length === 1) index[def.champ] = hits[0];
    else if (hits.length > 1) ambigues.push(def.debut + ' (' + hits.map(i => '« ' + ligneEntete[i] + ' »').join(', ') + ')');
    else if (def.requis) manquantes.push(def.debut);
    else absentesOptionnelles.push(def.debut);
  });
  return { index, manquantes, ambigues, absentesOptionnelles };
}

function versMontant(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[\s €]/g, '');
    // « 1.234,56 » (format français) comme « 1234.56 »
    const n = parseFloat(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  return 0;
}

// Une date Grist (secondes UTC à minuit) depuis ce que donne le fichier :
// objet Date (xlsx), « jj/mm/aaaa », « aaaa-mm-jj », ou numéro de série Excel.
function versDateGrist(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date || (typeof v === 'object' && typeof v.getTime === 'function')) {
    if (isNaN(v.getTime())) return null;
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()) / 1000;
  }
  if (typeof v === 'number') {
    // Série Excel (jours depuis le 30/12/1899) : 20000 ≈ 1954, 80000 ≈ 2119.
    if (v > 20000 && v < 80000) return Math.round((v - 25569) * FIN_JOUR);
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(s);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 1000;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000;
  return null;
}

function versTexte(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

const anneeDe = (ts) => (ts ? new Date(ts * 1000).getUTCFullYear() : null);

// L'exercice n'est pas écrit dans l'export : on propose l'année la plus
// représentée parmi les dates de facture, de paiement ou d'engagement.
function exerciceSuggere(ecritures) {
  const compte = {};
  (ecritures || []).forEach(e => {
    const a = anneeDe(e.dateFacture || e.datePaiement || e.dateEngagement);
    if (a) compte[a] = (compte[a] || 0) + 1;
  });
  const annees = Object.keys(compte).map(Number).sort((a, b) => (compte[b] - compte[a]) || (b - a));
  return annees.length ? annees[0] : null;
}

// Lit les lignes brutes d'une feuille (tableau de tableaux, première ligne =
// en-têtes). Rend { pfi, exercice, ecritures, avertissements } ou lève une
// erreur lisible. Les lignes sans numéro de flux sont des sous-totaux.
function lireExportSifac(lignes) {
  if (!lignes || lignes.length < 2) throw new Error('Fichier vide ou sans ligne d’en-tête.');
  // L'en-tête n'est pas toujours en première ligne (titre, filtres au-dessus) :
  // on prend la première ligne qui contient la colonne du numéro de flux.
  const iEntete = lignes.findIndex(l => (l || []).some(c => normaliserEntete(c).startsWith('numero de flux')));
  if (iEntete < 0) throw new Error('Colonne « Numéro de flux » introuvable : est-ce bien un export SIFAC des dépenses ?');
  const { index, manquantes, ambigues, absentesOptionnelles } = mapperEntetes(lignes[iEntete]);
  if (ambigues.length) throw new Error('Colonnes ambiguës : ' + ambigues.join(' ; ') + '.');
  if (manquantes.length) throw new Error('Colonnes SIFAC introuvables : ' + manquantes.join(', ') + '.');

  const defs = {};
  SIFAC_ENTETES.forEach(d => { defs[d.champ] = d; });
  const ecritures = lignes.slice(iEntete + 1)
    .filter(l => (l || []).some(c => c !== null && c !== undefined && String(c).trim() !== ''))
    .map(l => {
      const e = {};
      SIFAC_ENTETES.forEach(d => {
        const brut = index[d.champ] === undefined ? null : l[index[d.champ]];
        e[d.champ] = d.montant ? versMontant(brut) : d.date ? versDateGrist(brut) : versTexte(brut);
      });
      return e;
    })
    .filter(e => e.flux !== '');
  if (!ecritures.length) throw new Error('Aucune écriture exploitable dans le fichier.');

  // L'import remplace un périmètre (PFI, exercice) : un fichier qui mêle
  // plusieurs PFI rendrait ce périmètre ambigu.
  const pfis = Array.from(new Set(ecritures.map(e => e.pfi).filter(Boolean)));
  if (pfis.length !== 1) {
    throw new Error(pfis.length ? 'Le fichier mêle ' + pfis.length + ' PFI (' + pfis.join(', ') +
      ') : exportez-les séparément.' : 'Aucun PFI renseigné dans le fichier.');
  }
  const avertissements = absentesOptionnelles.length
    ? ['Colonnes absentes, laissées vides : ' + absentesOptionnelles.join(', ') + '.'] : [];
  return { pfi: pfis[0], exercice: exerciceSuggere(ecritures), ecritures, avertissements };
}

// CSV (repli si l'export est en .csv) : séparateur « ; » ou « , » deviné sur
// la première ligne, guillemets gérés.
function lireCsv(texte) {
  const src = String(texte || '').replace(/^﻿/, '');
  const premiere = src.split(/\r?\n/)[0] || '';
  const sep = (premiere.match(/;/g) || []).length >= (premiere.match(/,/g) || []).length ? ';' : ',';
  const lignes = [];
  let ligne = [], champ = '', guillemets = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (guillemets) {
      if (c === '"' && src[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// ---------------------------------------------------------------------
// Des écritures aux dépenses
// ---------------------------------------------------------------------
const arrondi2 = (n) => Math.round(n * 100) / 100;

// Le compte d'exécution budgétaire SIFAC : FG = fonctionnement, IG =
// investissement ; le reste (paie comprise, souvent sans code) = personnel.
function categorieSifac(code) {
  const c = String(code || '').trim().toUpperCase();
  return c === 'FG' ? 'Fonctionnement' : c === 'IG' ? 'Investissement' : 'Personnel';
}

// Payé dès qu'un paiement solde la facture — ou, sans facture (la paie),
// solde l'engagement ; livré dès qu'il y a facture ; engagé sinon. On regarde
// l'existence d'écritures et pas le signe des totaux : une facture suivie
// d'un avoir retombe à zéro sans être « livrée ».
function statutFlux(ecritures, facture, paye, engage) {
  const aFacture = ecritures.some(e => e.numFacture || e.facture);
  const aPaiement = ecritures.some(e => e.datePaiement || e.paye);
  if (aPaiement && aFacture && Math.abs(paye - facture) < 0.01) return 'Payé';
  if (aPaiement && !aFacture && paye > 0 && paye >= (engage || 0) - 0.01) return 'Payé';
  if (aFacture && facture > 0) return 'Livré';
  return 'Engagé';
}

function premierNonVide(ecritures, champ) {
  const e = ecritures.find(x => x[champ]);
  return e ? e[champ] : '';
}
function borne(ecritures, champ, fn) {
  const v = ecritures.map(e => e[champ]).filter(Boolean);
  return v.length ? fn(...v) : null;
}

// Une dépense par flux, tous exercices confondus : une commande engagée en
// 2025 et payée en 2026 reste une seule dépense.
function agregerParFlux(ecritures) {
  const groupes = new Map();
  (ecritures || []).forEach(e => {
    if (!e.flux) return;
    if (!groupes.has(e.flux)) groupes.set(e.flux, []);
    groupes.get(e.flux).push(e);
  });
  return Array.from(groupes.entries()).map(([flux, lot]) => {
    const somme = (c) => arrondi2(lot.reduce((t, e) => t + (Number(e[c]) || 0), 0));
    // Un report est un engagement de l'exercice précédent qui se poursuit :
    // il compte comme engagé.
    const report = somme('report');
    const engage = arrondi2(somme('engage') + report), facture = somme('facture'), paye = somme('paye');
    const statut = statutFlux(lot, facture, paye, engage);
    return {
      flux,
      pfi: premierNonVide(lot, 'pfi'),
      libelle: premierNonVide(lot, 'libelleFlux'),
      fournisseur: premierNonVide(lot, 'tiers'),
      codeTiers: premierNonVide(lot, 'codeTiers'),
      compte: premierNonVide(lot, 'compte'),
      libelleCompte: premierNonVide(lot, 'libelleCompte'),
      otp: premierNonVide(lot, 'otp'),
      categorie: categorieSifac(premierNonVide(lot, 'compteExecution')),
      statut,
      // Le montant qui compte est celui de l'état atteint.
      montant: statut === 'Payé' ? paye : statut === 'Livré' ? facture : engage,
      engage, facture, paye, report,
      dateEngagement: borne(lot, 'dateEngagement', Math.min),
      dateFacture: borne(lot, 'dateFacture', Math.max),
      datePaiement: borne(lot, 'datePaiement', Math.max),
      nbEcritures: lot.length
    };
  });
}

// Compare les dépenses calculées à celles du document (même PFI, source
// SIFAC). Rapprochement sur le numéro de flux seul. Les dépenses saisies à la
// main ne sont jamais touchées ; celles qui ont disparu de SIFAC sont
// signalées (orphelines), jamais supprimées.
function rapprocher(agregats, existantes, pfi) {
  const parFlux = new Map();
  (existantes || []).forEach(d => {
    if (d.source !== 'SIFAC' || !d.flux || (pfi && d.pfi && d.pfi !== pfi)) return;
    parFlux.set(d.flux, d);
  });
  const aCreer = [], aMettreAJour = [], vus = new Set();
  (agregats || []).forEach(a => {
    vus.add(a.flux);
    const d = parFlux.get(a.flux);
    if (d) aMettreAJour.push({ id: d.id, agregat: a, etaitOrpheline: !!d.orpheline });
    else aCreer.push(a);
  });
  const orphelines = [];
  parFlux.forEach((d, flux) => { if (!vus.has(flux) && !d.orpheline) orphelines.push(d.id); });
  return { aCreer, aMettreAJour, orphelines };
}

// Les champs qu'un import réécrit. Ligne budgétaire, projet et notes n'y
// figurent pas : c'est le tri fait à la main, il survit aux réimports.
function champsSifac(a) {
  return {
    Flux: a.flux, Libelle: a.libelle, Fournisseur: a.fournisseur, Code_tiers: a.codeTiers,
    Compte: a.compte, Libelle_compte: a.libelleCompte, Categorie: a.categorie, Statut: a.statut,
    Montant: a.montant, Montant_engage: a.engage, Montant_facture: a.facture, Montant_paye: a.paye,
    Date_engagement: a.dateEngagement, Date_facture: a.dateFacture, Date_paiement: a.datePaiement,
    PFI: a.pfi, OTP: a.otp, Source: 'SIFAC', Orpheline: false
  };
}

function champsEcriture(e, exercice) {
  return {
    PFI: e.pfi, Exercice: exercice, Flux: e.flux, Libelle_flux: e.libelleFlux, Rubrique: e.rubrique,
    Tiers: e.tiers, Code_tiers: e.codeTiers, Compte: e.compte, Libelle_compte: e.libelleCompte,
    Compte_execution: e.compteExecution, OTP: e.otp, Date_engagement: e.dateEngagement,
    Montant_engage: e.engage, Montant_service_fait: e.serviceFait, Date_service_fait: e.dateServiceFait,
    Num_facture: e.numFacture, Date_facture: e.dateFacture, Montant_facture: e.facture,
    Montant_paye: e.paye, Date_paiement: e.datePaiement, Report: e.report
  };
}

// Actions Grist en colonnes (BulkAddRecord / BulkUpdateRecord) pour une liste
// d'enregistrements qui partagent les mêmes clés.
function enColonnes(enregs) {
  const cols = {};
  const cles = enregs.length ? Object.keys(enregs[0]) : [];
  cles.forEach(k => { cols[k] = enregs.map(r => (r[k] === undefined ? null : r[k])); });
  return cols;
}

// ---------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------
const FIN_CATEGORIES = ['Personnel', 'Fonctionnement', 'Investissement'];

// Totaux d'un exercice à partir des écritures (seule vue exacte année par
// année) et des dépenses manuelles datées de cet exercice.
function totauxExercice(ecritures, manuelles, exercice) {
  const t = { engage: 0, facture: 0, paye: 0, report: 0, parCategorie: {} };
  FIN_CATEGORIES.forEach(c => { t.parCategorie[c] = { engage: 0, facture: 0, paye: 0 }; });
  const ajouter = (cat, engage, facture, paye) => {
    const c = t.parCategorie[cat] || (t.parCategorie[cat] = { engage: 0, facture: 0, paye: 0 });
    c.engage += engage; c.facture += facture; c.paye += paye;
    t.engage += engage; t.facture += facture; t.paye += paye;
  };
  (ecritures || []).filter(e => Number(e.exercice) === Number(exercice)).forEach(e => {
    // Les reports entrent dans l'engagé de l'exercice qui les reçoit ; leur
    // total est aussi donné à part.
    ajouter(categorieSifac(e.compteExecution), (Number(e.engage) || 0) + (Number(e.report) || 0), Number(e.facture) || 0, Number(e.paye) || 0);
    t.report += Number(e.report) || 0;
  });
  (manuelles || []).filter(d => anneeDe(d.dateEngagement || d.dateFacture || d.datePaiement) === Number(exercice)).forEach(d => {
    ajouter(d.categorie || 'Fonctionnement', Number(d.engage) || 0, Number(d.facture) || 0, Number(d.paye) || 0);
  });
  const r = (o) => { Object.keys(o).forEach(k => { if (typeof o[k] === 'number') o[k] = arrondi2(o[k]); }); };
  r(t); Object.values(t.parCategorie).forEach(r);
  return t;
}

// Consommation de chaque ligne budgétaire : les dépenses qui y sont
// rattachées, et le reste à dépenser. `nonAffectees` : ce qui attend un tri.
function consommationBudget(lignesBudget, depenses) {
  const parLigne = new Map((lignesBudget || []).map(l => [l.id, { ligne: l, engage: 0, paye: 0, nb: 0 }]));
  let nonAffectees = { nb: 0, montant: 0 };
  (depenses || []).forEach(d => {
    const c = d.budgetLigne ? parLigne.get(d.budgetLigne) : null;
    if (c) { c.engage += Number(d.montant) || 0; c.paye += Number(d.paye) || 0; c.nb++; }
    else if (!d.orpheline) { nonAffectees.nb++; nonAffectees.montant += Number(d.montant) || 0; }
  });
  const lignes = Array.from(parLigne.values()).map(c => {
    const prevu = Number(c.ligne.prevu) || 0;
    return Object.assign(c, {
      engage: arrondi2(c.engage), paye: arrondi2(c.paye),
      reste: arrondi2(prevu - c.engage),
      taux: prevu > 0 ? c.engage / prevu : null
    });
  });
  nonAffectees.montant = arrondi2(nonAffectees.montant);
  return { lignes, nonAffectees };
}

// Paiements cumulés mois par mois sur un exercice (12 points), pour la courbe
// de consommation. Les mois futurs valent null : la courbe s'arrête à
// aujourd'hui au lieu de tracer un plateau trompeur.
function cumulMensuel(ecritures, exercice, champDate, champMontant, now) {
  const mois = new Array(12).fill(0);
  (ecritures || []).forEach(e => {
    const ts = e[champDate];
    if (!ts || anneeDe(ts) !== Number(exercice)) return;
    mois[new Date(ts * 1000).getUTCMonth()] += Number(e[champMontant]) || 0;
  });
  const n = new Date((now || Date.now() / 1000) * 1000);
  const dernier = n.getUTCFullYear() > exercice ? 11 : n.getUTCFullYear() < exercice ? -1 : n.getUTCMonth();
  let cumul = 0;
  return mois.map((v, i) => { cumul += v; return i <= dernier ? arrondi2(cumul) : null; });
}

// Fournisseurs par montant, pour repérer les principaux postes.
function topFournisseurs(depenses, n) {
  const par = {};
  (depenses || []).forEach(d => {
    const k = d.fournisseur || '(sans tiers — paie, écritures internes)';
    par[k] = (par[k] || 0) + (Number(d.montant) || 0);
  });
  return Object.entries(par).map(([nom, montant]) => ({ nom, montant: arrondi2(montant) }))
    .sort((a, b) => b.montant - a.montant).slice(0, n || 8);
}

if (typeof window !== 'undefined') {
  window.finance = {
    FIN_TABLES, FIN_CATEGORIES, SIFAC_ENTETES, actionsCreationTables,
    normaliserEntete, mapperEntetes, versMontant, versDateGrist, exerciceSuggere, lireExportSifac, lireCsv,
    categorieSifac, statutFlux, agregerParFlux, rapprocher, champsSifac, champsEcriture, enColonnes,
    totauxExercice, consommationBudget, cumulMensuel, topFournisseurs
  };
}
