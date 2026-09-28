// Tests des fonctions pures de finance.js (import SIFAC, synthèse budgétaire).
import fs from 'node:fs';
import vm from 'node:vm';

const src = ['../common.js', '../finance.js'].map(f => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
const sandbox = { console, window: {}, document: undefined };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const f = sandbox.window.finance;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) pass++;
  else { fail++; console.log(`FAIL  ${label}\n      got:      ${a}\n      expected: ${b}`); }
}
function throws(fn, re, label) {
  try { fn(); fail++; console.log(`FAIL  ${label} (pas d'erreur)`); }
  catch (e) { if (re.test(e.message)) pass++; else { fail++; console.log(`FAIL  ${label}: ${e.message}`); } }
}
const D = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

// En-têtes tels que SIFAC les écrit : tronqués à 30 caractères, apostrophes
// typographiques, accents.
const ENTETE = ['Programme de financement', 'Numéro de flux', 'Libellé du flux', 'Rubrique de la pièce', 'Nom du tiers',
  'Numéro du tiers fournisseur', 'Compte général', 'Libellé compte général', 'Date initiale', 'Montant engagé HTR',
  'Montant HTR des SF', 'Montant réceptionné non factur', 'Date comptable du CSF', 'Numéro de facture',
  'Date comptable facture', 'Texte facture', 'Montant facturé HTR', 'Montant payé', 'Date de paiement', 'Report',
  'Élément d’OTP', 'Compte d’exécution budgétaire'];
const L = (flux, o) => {
  const v = Object.assign({ pfi: 'SEQUOIA-24', lib: 'Achat', tiers: 'Dell', code: 'F100', cpt: '6064', dEng: null, eng: 0,
    nfac: '', dFac: null, fac: 0, paye: 0, dPay: null, rep: 0, cex: 'FG' }, o);
  return [v.pfi, flux, v.lib, '', v.tiers, v.code, v.cpt, 'Fournitures', v.dEng, v.eng, 0, 0, null, v.nfac, v.dFac, '',
    v.fac, v.paye, v.dPay, v.rep, 'OTP1', v.cex];
};

// ---- Lecture ----
eq(f.normaliserEntete('  Élément d’OTP '), "element d'otp", 'normaliserEntete: accents, apostrophe, espaces');
const m = f.mapperEntetes(ENTETE);
eq([m.manquantes, m.ambigues, m.absentesOptionnelles], [[], [], []], 'mapperEntetes: export complet reconnu');
eq(m.index.compte, 6, 'mapperEntetes: « Compte général » distinct de « Libellé compte général »');
eq(f.versMontant('1 234,56 €'), 1234.56, 'versMontant: format français');
eq(f.versMontant('1.234,5'), 1234.5, 'versMontant: point des milliers');
eq(f.versMontant('12.5'), 12.5, 'versMontant: point décimal');
eq(f.versDateGrist('14/03/2026'), D(2026, 3, 14), 'versDateGrist: jj/mm/aaaa');
eq(f.versDateGrist('2026-03-14'), D(2026, 3, 14), 'versDateGrist: ISO');
eq(f.versDateGrist(new Date(Date.UTC(2026, 2, 14))), D(2026, 3, 14), 'versDateGrist: Date');
eq(f.versDateGrist(46095), D(2026, 3, 14), 'versDateGrist: série Excel');
eq(f.versDateGrist(''), null, 'versDateGrist: vide');

const fichier = [
  ['Export SIFAC — dépenses'], [],
  ENTETE,
  L('F1', { eng: 1000, dEng: '10/01/2026' }),
  L('F1', { fac: 1000, nfac: 'FA1', dFac: '12/02/2026' }),
  L('F1', { paye: 1000, dPay: '20/02/2026' }),
  L('F2', { eng: 500, dEng: '01/03/2026', tiers: 'Ikea', code: 'F200', cex: 'IG' }),
  L('F2', { fac: 500, nfac: 'FA2', dFac: '15/03/2026', tiers: 'Ikea', code: 'F200', cex: 'IG' }),
  L('F3', { eng: 3000, dEng: '05/04/2026', tiers: '', code: '', cex: '' }),
  ['', '', 'Sous-total', '', '', '', '', '', '', 4500]
];
const lu = f.lireExportSifac(fichier);
eq([lu.pfi, lu.exercice, lu.ecritures.length], ['SEQUOIA-24', 2026, 6], 'lireExportSifac: en-tête trouvé sous un titre, sous-total écarté');
eq(lu.ecritures[0].dateEngagement, D(2026, 1, 10), 'lireExportSifac: dates converties');
throws(() => f.lireExportSifac([['Nom', 'Montant'], ['a', 1]]), /Numéro de flux/, 'lireExportSifac: pas un export SIFAC');
throws(() => f.lireExportSifac([ENTETE.filter(h => h !== 'Montant payé'), L('F1', {})]), /introuvables : montant paye/, 'lireExportSifac: colonne requise manquante');
throws(() => f.lireExportSifac([ENTETE, L('F1', {}), L('F2', { pfi: 'AUTRE' })]), /mêle 2 PFI/, 'lireExportSifac: plusieurs PFI refusés');
eq(f.lireExportSifac([ENTETE.slice(0, 19).concat(['Élément d’OTP', 'Compte d’exécution budgétaire']), L('F1', {}).filter((_, i) => i !== 19)]).avertissements.length, 1, 'lireExportSifac: colonne optionnelle absente = avertissement');

eq(f.lireCsv('a;b;c\n1;"x;y";3\r\n4;"dit ""oui""";6\n'), [['a', 'b', 'c'], ['1', 'x;y', '3'], ['4', 'dit "oui"', '6']], 'lireCsv: séparateur ; et guillemets');
eq(f.lireCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']], 'lireCsv: séparateur ,');

// ---- Agrégation ----
eq([f.categorieSifac('FG'), f.categorieSifac('ig'), f.categorieSifac(''), f.categorieSifac('XX')],
  ['Fonctionnement', 'Investissement', 'Personnel', 'Personnel'], 'categorieSifac');
const ag = f.agregerParFlux(lu.ecritures);
const parFlux = Object.fromEntries(ag.map(a => [a.flux, a]));
eq([parFlux.F1.statut, parFlux.F1.montant, parFlux.F1.nbEcritures, parFlux.F1.dateEngagement, parFlux.F1.datePaiement],
  ['Payé', 1000, 3, D(2026, 1, 10), D(2026, 2, 20)], 'agregerParFlux: flux payé, dates bornées');
eq([parFlux.F2.statut, parFlux.F2.montant, parFlux.F2.categorie], ['Livré', 500, 'Investissement'], 'agregerParFlux: flux livré');
eq([parFlux.F3.statut, parFlux.F3.montant, parFlux.F3.categorie], ['Engagé', 3000, 'Personnel'], 'agregerParFlux: flux engagé, sans code = personnel');
const avoir = f.agregerParFlux([{ flux: 'A', numFacture: 'X', facture: 100, paye: 0 }, { flux: 'A', numFacture: 'Y', facture: -100, paye: 0 }]);
eq(avoir[0].statut, 'Engagé', 'statutFlux: facture puis avoir = rien à payer, pas livré');
const paie = f.agregerParFlux([{ flux: 'P', engage: 4300 }, { flux: 'P', paye: 4300, datePaiement: 1 }])[0];
eq([paie.statut, paie.montant], ['Payé', 4300], 'statutFlux: paie sans facture, payée = payé');
const rep = f.agregerParFlux([{ flux: 'R', report: 7800 }, { flux: 'R', numFacture: 'X', facture: 7800 }])[0];
eq([rep.engage, rep.statut], [7800, 'Livré'], 'agregerParFlux: le report compte comme engagé');
eq(f.totauxExercice([{ exercice: 2026, report: 100, engage: 0 }], [], 2026).engage, 100, 'totauxExercice: report dans l’engagé');
eq(f.agregerParFlux([{ flux: 'B', facture: 0.1 }, { flux: 'B', facture: 0.2 }, { flux: 'B', paye: 0.3, datePaiement: 1 }])[0].statut, 'Payé', 'agregerParFlux: arrondi des centimes');

// ---- Rapprochement ----
const existantes = [
  { id: 1, flux: 'F1', source: 'SIFAC', pfi: 'SEQUOIA-24' },
  { id: 2, flux: 'F9', source: 'SIFAC', pfi: 'SEQUOIA-24' },
  { id: 3, flux: 'F2', source: 'Manuelle', pfi: 'SEQUOIA-24' },
  { id: 4, flux: 'F8', source: 'SIFAC', pfi: 'AUTRE' },
  { id: 5, flux: 'F7', source: 'SIFAC', pfi: 'SEQUOIA-24', orpheline: true }
];
const r = f.rapprocher(ag, existantes, 'SEQUOIA-24');
eq([r.aCreer.map(a => a.flux).sort(), r.aMettreAJour.map(u => u.id), r.orphelines],
  [['F2', 'F3'], [1], [2]], 'rapprocher: flux seul, manuelles et autres PFI ignorées, orpheline déjà signalée non recomptée');
const champs = f.champsSifac(parFlux.F1);
eq(['Budget_ligne' in champs, 'Opportunite' in champs, 'Notes' in champs, champs.Source], [false, false, false, 'SIFAC'], 'champsSifac: le tri manuel n’est jamais réécrit');
eq(f.enColonnes([{ a: 1, b: 2 }, { a: 3, b: undefined }]), { a: [1, 3], b: [2, null] }, 'enColonnes');
eq(f.actionsCreationTables(['budget'])[0].slice(0, 2), ['AddTable', 'Budget_lignes'], 'actionsCreationTables');

// ---- Synthèse ----
const ecr = lu.ecritures.map(e => Object.assign({ exercice: 2026 }, e));
const t = f.totauxExercice(ecr, [{ categorie: 'Fonctionnement', engage: 200, facture: 0, paye: 0, dateEngagement: D(2026, 5, 1) },
  { categorie: 'Fonctionnement', engage: 999, dateEngagement: D(2025, 5, 1) }], 2026);
eq([t.engage, t.facture, t.paye], [4700, 1500, 1000], 'totauxExercice: écritures de l’exercice + manuelles datées');
eq(t.parCategorie.Investissement, { engage: 500, facture: 500, paye: 0 }, 'totauxExercice: par catégorie');
eq(f.totauxExercice(ecr, [], 2025).engage, 0, 'totauxExercice: autre exercice vide');

const c = f.consommationBudget([{ id: 10, prevu: 2000 }, { id: 11, prevu: 0 }],
  [{ budgetLigne: 10, montant: 1500, paye: 1000 }, { budgetLigne: 10, montant: 1000, paye: 0 }, { budgetLigne: null, montant: 300 },
    { budgetLigne: null, montant: 50, orpheline: true }]);
eq(c.lignes.map(l => [l.engage, l.paye, l.reste, l.taux]), [[2500, 1000, -500, 1.25], [0, 0, 0, null]], 'consommationBudget: dépassement visible');
eq(c.nonAffectees, { nb: 1, montant: 300 }, 'consommationBudget: non affectées hors orphelines');

const cm = f.cumulMensuel(ecr, 2026, 'datePaiement', 'paye', D(2026, 4, 15));
eq(cm.slice(0, 5), [0, 1000, 1000, 1000, null], 'cumulMensuel: cumul, mois futurs à null');
eq(f.topFournisseurs([{ fournisseur: 'A', montant: 10 }, { fournisseur: '', montant: 50 }, { fournisseur: 'A', montant: 5 }], 2).map(x => x.montant), [50, 15], 'topFournisseurs');

console.log(`\n${pass} passed, ${fail} failed (finance)`);
if (fail) process.exit(1);
