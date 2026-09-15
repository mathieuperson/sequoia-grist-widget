// Tests des fonctions pures de pilotage.js (étapes, urgence, indicateurs,
// moteur de suggestions). Même harnais minimal que common.test.mjs : les
// deux fichiers sont écrits pour un <script> classique, donc évalués dans
// un sandbox vm avec un shim `window`.
import fs from 'node:fs';
import vm from 'node:vm';

const common = fs.readFileSync(new URL('../common.js', import.meta.url), 'utf8');
const pilotage = fs.readFileSync(new URL('../pilotage.js', import.meta.url), 'utf8');
const sandbox = { console, window: {}, document: undefined };
vm.createContext(sandbox);
// pilotage.js s'appuie sur common.js (normalizeKey, daysSince, formatMontantCompact…)
vm.runInContext(common + '\n' + pilotage, sandbox);
const p = sandbox.window.pilotage;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`FAIL  ${label}\n      got:      ${a}\n      expected: ${e}`); }
}

// Date de référence des tests : mardi 8 septembre 2026, comme la maquette.
const D = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
const NOW = D(2026, 9, 8);

// ---- Étapes : les deux vocabulaires (6 statuts actuels / 8 cibles) ----
eq(p.stageRank('Idée') < p.stageRank('Qualification'), true, 'stageRank: Idée avant Qualification');
eq(p.stageRank('Montage') < p.stageRank('Contractualisation'), true, 'stageRank: Montage avant Contractualisation');
eq(p.stageRank('Statut inventé'), null, 'stageRank: valeur inconnue -> Infinity (sérialisé null)');
eq(p.matchStage("recherche d'EQUIPE").key, 'recherchedequipe', 'matchStage: insensible à la casse, aux accents et aux séparateurs');
eq(p.matchStage('Terminé / abandonné').key, 'termineabandonne', 'matchStage: "Terminé / abandonné" reste distinct...');
eq(p.matchStage('Abandonné').key, 'abandonne', '...de "Abandonné" seul (exact avant sous-chaîne)');
eq(p.matchStage(''), null, 'matchStage: vide -> null');

eq(p.orderStages(['Montage', 'Idée', 'Contractualisation', 'Qualification']),
  ['Idée', 'Qualification', 'Montage', 'Contractualisation'], 'orderStages: remis dans l\'ordre canonique');
eq(p.orderStages(['Abandonné', 'Prospection', 'Concrétisé', 'Montage']),
  ['Prospection', 'Montage', 'Concrétisé', 'Abandonné'], 'orderStages: vocabulaire actuel du document');
eq(p.orderStages(['Montage', 'Étape maison', 'Idée']),
  ['Idée', 'Montage', 'Étape maison'], 'orderStages: valeur inconnue rangée à la fin, jamais perdue');
eq(p.orderStages(['Montage', 'Montage', '', null]), ['Montage'], 'orderStages: dédoublonne et ignore les vides');

// ---- Familles : c'est ce qui rend les KPI justes dans les deux vocabulaires ----
eq(p.isStageIn('Qualification', 'discussion'), true, 'familles: Qualification est "en discussion"...');
eq(p.isStageIn('Qualification', 'pondere'), true, '...et compte aussi dans le pipeline pondéré');
eq(p.isStageIn('Montage', 'discussion'), false, 'familles: Montage n\'est plus "en discussion"');
eq(p.isStageIn('Prospection', 'discussion'), true, 'familles: Prospection (statut actuel) est "en discussion"');
eq(p.isStageIn('Concrétisé', 'lance'), true, 'familles: Concrétisé == Projet lancé');
eq(p.isStageIn('Projet lancé', 'lance'), true, 'familles: Projet lancé (cible) même famille');
eq(p.isStageIn('Statut inventé', 'discussion'), false, 'familles: valeur inconnue n\'appartient à rien');

// ---- Couleur d'étape (palette de progression du pipeline) ----
eq(p.stageColor('Montage'), 'var(--stage-montage)', 'stageColor: une variable CSS par étape');
eq(p.stageColor("Recherche d'équipe"), 'var(--stage-recherchedequipe)', 'stageColor: clé dérivée du libellé');
eq(p.stageColor('Concrétisé'), 'var(--stage-concretise)', 'stageColor: statut actuel du document');
eq(p.stageColor('Statut inventé'), 'var(--status-default)',
  'stageColor: étape inconnue -> repli sur statusColor de common.css');
eq(p.stageColor('Abandonné'), 'var(--stage-abandonne)', 'stageColor: l\'abandon garde sa couleur à part');

// ---- Dispositifs ----
eq(p.dispositifClass('CIFRE'), 'tag-cifre', 'dispositifClass: CIFRE');
eq(p.dispositifClass('Chaire industrielle'), 'tag-chaire', 'dispositifClass: sous-chaîne (Chaire industrielle)');
eq(p.dispositifClass('ANR PRCE'), 'tag-national', 'dispositifClass: ANR PRCE -> projet national');
eq(p.dispositifClass('Projet national'), 'tag-national', 'dispositifClass: la valeur réelle du document');
eq(p.dispositifClass('Projet interne'), 'tag-interne', 'dispositifClass: projet interne');
eq(p.dispositifClass('Projet européen'), 'tag-europe', 'dispositifClass: Projet européen');
eq(p.dispositifClass('POC'), 'tag-autre', 'dispositifClass: dispositif hors liste -> autre');
eq(p.dispositifClass(''), 'tag-autre', 'dispositifClass: vide -> autre');
eq(p.isCifre('CIFRE + ANR'), true, 'isCifre: correspondance de sous-chaîne (combo)');
eq(p.isCifre('Chaire'), false, 'isCifre: pas un faux positif');

// ---- Montants ----
eq(p.formatMontantOrDash(145000), '145 k€', 'formatMontantOrDash: 145 000 € -> 145 k€');
eq(p.formatMontantOrDash(1200000), '1,2 M€', 'formatMontantOrDash: 1 200 000 € -> 1,2 M€');
eq(p.formatMontantOrDash(0), '—', 'formatMontantOrDash: 0 -> tiret (pas encore chiffré)');
eq(p.formatMontantOrDash(null), '—', 'formatMontantOrDash: null -> tiret');
eq(p.formatMontantOrDash(''), '—', 'formatMontantOrDash: vide -> tiret');
eq(p.sumMontants([{ montant: 1000 }, { montant: '2000' }, { montant: null }, {}]), 3000,
  'sumMontants: ignore les montants absents, accepte les nombres en texte');

// ---- Urgence ----
eq(p.urgenceOf(D(2026, 9, 5), NOW), 'retard', 'urgenceOf: échéance passée -> retard');
eq(p.urgenceOf(D(2026, 9, 8), NOW), 'aujourdhui', 'urgenceOf: aujourd\'hui');
eq(p.urgenceOf(D(2026, 9, 12), NOW), 'semaine', 'urgenceOf: dans 4 j -> cette semaine');
eq(p.urgenceOf(D(2026, 9, 15), NOW), 'semaine', 'urgenceOf: dans 7 j -> encore cette semaine (borne incluse)');
eq(p.urgenceOf(D(2026, 9, 16), NOW), 'plustard', 'urgenceOf: dans 8 j -> plus tard');
eq(p.urgenceOf(null, NOW), 'sansdate', 'urgenceOf: sans échéance -> groupe dédié');
eq(p.daysLate(D(2026, 9, 5), NOW), 3, 'daysLate: 3 jours de retard');
eq(p.daysLate(D(2026, 9, 20), NOW), 0, 'daysLate: à venir -> 0');

const ACTIONS = [
  { id: 1, label: 'Relancer Sopra Steria', due: D(2026, 9, 5), montant: 0 },
  { id: 2, label: 'Envoyer 3 profils', due: D(2026, 9, 8), montant: 140000 },
  { id: 3, label: 'Compléter le volet budgétaire du dossier', due: D(2026, 9, 8), montant: 860000 },
  { id: 4, label: 'Obtenir la grille de frais', due: D(2026, 9, 10), montant: 1200000 },
  { id: 5, label: 'Réunion de cadrage', due: D(2026, 9, 12), montant: 480000 },
  { id: 6, label: 'Rendez-vous lointain', due: D(2026, 11, 30), montant: 0 },
  { id: 7, label: 'Action classée', due: D(2026, 9, 1), montant: 0, done: true }
];
const groups = p.groupActionsByUrgence(ACTIONS, NOW);
eq(groups.map(g => g.key), ['retard', 'aujourdhui', 'semaine', 'plustard'],
  'groupActionsByUrgence: groupes dans l\'ordre, les vides omis');
eq(groups.map(g => g.actions.length), [1, 2, 2, 1], 'groupActionsByUrgence: effectifs par groupe');
eq(groups[1].actions.map(a => a.id), [3, 2],
  'groupActionsByUrgence: à échéance égale, l\'enjeu le plus lourd d\'abord');
eq(groups[2].actions.map(a => a.id), [4, 5], 'groupActionsByUrgence: échéance la plus proche d\'abord');
eq(groups.some(g => g.actions.some(a => a.id === 7)), false,
  'groupActionsByUrgence: une action cochée sort des groupes');
eq(p.groupActionsByUrgence([], NOW), [], 'groupActionsByUrgence: aucune action -> aucun groupe');
eq(p.groupActionsByUrgence(ACTIONS, NOW)[0].rule, 'À TRAITER EN PRIORITÉ',
  'groupActionsByUrgence: le groupe porte sa règle en micro-libellé');

// ---- Effort estimé (heuristique) ----
eq(p.estimatedEffortMinutes({ label: 'Relancer Sopra Steria' }), 15, 'effort: relancer -> 15 min');
eq(p.estimatedEffortMinutes({ label: 'Envoyer 3 profils d\'équipes cyber' }), 45, 'effort: envoyer -> 45 min');
eq(p.estimatedEffortMinutes({ label: 'Compléter le volet budgétaire du dossier' }), 120,
  'effort: la règle la plus lourde gagne (dossier avant compléter)');
eq(p.estimatedEffortMinutes({ label: 'Préparer la note comparative' }), 90, 'effort: note comparative -> 1 h 30');
eq(p.estimatedEffortMinutes({ label: 'Action sans verbe connu', stage: 'Montage' }), 120,
  'effort: repli sur l\'étape quand le libellé ne dit rien');
eq(p.estimatedEffortMinutes({ label: 'Action sans verbe connu' }), 30, 'effort: repli par défaut -> 30 min');
eq(p.formatEffort(15), '15 min', 'formatEffort: 15 min');
eq(p.formatEffort(90), '1 h 30', 'formatEffort: 90 -> 1 h 30');
eq(p.formatEffort(120), '2 h', 'formatEffort: 120 -> 2 h');
eq(p.formatEffort(0), '', 'formatEffort: 0 -> vide');

// ---- Motifs ----
const motifCtx = { now: NOW, relanceSeuil: 30 };
eq(p.actionMotif({ label: 'Relancer', due: D(2026, 9, 5) }, motifCtx).label, 'PROMESSE NON TENUE · 3 J',
  'motif: retard -> promesse non tenue avec le nombre de jours');
eq(p.actionMotif({ label: 'Compléter le dossier', due: D(2026, 9, 8), depotDue: D(2026, 9, 17), depotLabel: 'Région' }, motifCtx).label,
  'DÉPÔT RÉGION DANS 9 J', 'motif: date de dépôt proche');
eq(p.actionMotif({ label: 'Obtenir la grille', due: D(2026, 9, 10), montant: 1200000 }, motifCtx).label,
  'BLOQUE 1,2 M€', 'motif: enjeu financier au-delà du million');
eq(p.actionMotif({ label: 'Reprendre contact', due: D(2026, 9, 10), partnerLastContact: D(2026, 3, 12) }, motifCtx).label,
  'PARTENAIRE À RELANCER', 'motif: partenaire sans contact depuis longtemps');
eq(p.actionMotif({ label: 'Trouver une équipe', due: D(2026, 9, 10), stage: 'Idée', hasTeam: false, stageSince: D(2026, 8, 1) }, motifCtx).label,
  'IDÉE SANS ÉQUIPE DEPUIS 38 J', 'motif: idée sans équipe rattachée');
eq(p.actionMotif({ label: 'Envoyer 3 profils', due: D(2026, 9, 8) }, motifCtx).label, 'ATTENDU PAR LE PARTENAIRE',
  'motif: une action "envoyer" est attendue en face');
eq(p.actionMotif({ label: 'Relancer', due: D(2026, 9, 5), origin: 'suggestion' }, motifCtx).label, 'SUGGESTION ACCEPTÉE',
  'motif: une suggestion acceptée garde sa trace, avant toute autre règle');
eq(p.actionMotif({ label: 'Action neutre', due: D(2026, 9, 20) }, motifCtx), null,
  'motif: aucune règle ne s\'applique -> null (pas d\'étiquette inventée)');

// ---- Partenaires à relancer ----
const PARTNERS = [
  { id: 1, name: 'Kerlink', lastContact: D(2026, 3, 12) },
  { id: 2, name: 'Studio Malouin Games', lastContact: D(2026, 7, 6) },
  { id: 3, name: 'InterDigital', lastContact: D(2026, 7, 10) },
  { id: 4, name: 'Orange Innovation', lastContact: D(2026, 9, 1) },
  { id: 5, name: 'Jamais contacté', lastContact: null }
];
const relances = p.partnersToFollowUp(PARTNERS, { seuil: 30, now: NOW });
eq(relances.map(o => o.partner.name), ['Jamais contacté', 'Kerlink', 'Studio Malouin Games', 'InterDigital'],
  'partnersToFollowUp: jamais contacté en tête, puis du plus ancien au plus récent');
eq(relances.map(o => o.days), [null, 180, 64, 60], 'partnersToFollowUp: ancienneté en jours');
eq(p.partnersToFollowUp(PARTNERS, { seuil: 365, now: NOW }).map(o => o.partner.name), ['Jamais contacté'],
  'partnersToFollowUp: le seuil est respecté');
eq(p.relanceTone(180), 'danger', 'relanceTone: 6 mois -> alerte');
eq(p.relanceTone(64), 'warn', 'relanceTone: 2 mois -> attention');
eq(p.relanceTone(35), 'ok', 'relanceTone: 35 j -> normal');
eq(p.formatAnciennete(180), '6 mois', 'formatAnciennete: bascule en mois au-delà de 60 j');
eq(p.formatAnciennete(41), '41 jours', 'formatAnciennete: en jours en dessous');
eq(p.formatAnciennete(400), '1 an', 'formatAnciennete: bascule en années');

// ---- Pipeline ----
// Le jeu de la maquette : 6 projets en discussion, 5,2 M€ de pipeline pondéré.
const PROJECTS = [
  { id: 1, title: 'Extraction juridique', partnerId: 10, partnerName: 'Capgemini', dispositif: 'CIFRE', stage: 'Idée', montant: 0 },
  { id: 2, title: 'VisionMer', partnerId: 11, partnerName: 'Kerlink', dispositif: 'ANR PRCE', stage: 'Premier échange', montant: 320000 },
  { id: 3, title: 'Parcours de jeu', partnerId: 12, partnerName: 'Studio Malouin', dispositif: 'Stage / projet étudiant', stage: 'Premier échange', montant: 0 },
  { id: 4, title: 'LabCom Cyber-défense', partnerId: 13, partnerName: 'Thales', dispositif: 'LabCom', stage: 'Qualification', montant: 480000 },
  { id: 5, title: 'Cyber-résilience bancaire', partnerId: 14, partnerName: 'Arkéa', dispositif: 'CIFRE', stage: 'Qualification', montant: 140000 },
  { id: 6, title: 'TrustAI', partnerId: 15, partnerName: 'b<>com', dispositif: 'Projet européen', stage: "Recherche d'équipe", montant: 2400000 },
  { id: 7, title: 'Chaire IA frugale', partnerId: 16, partnerName: 'Orange', dispositif: 'Chaire', stage: 'Montage', montant: 1200000 },
  { id: 8, title: 'Chaire Santé & IA', partnerId: 17, partnerName: 'Région Bretagne', dispositif: 'Chaire', stage: 'Montage', montant: 860000 },
  { id: 9, title: 'CIFRE Sopra', partnerId: 18, partnerName: 'Sopra Steria', dispositif: 'CIFRE', stage: 'Contractualisation', montant: 135000 },
  { id: 10, title: 'LabCom InterDigital', partnerId: 19, partnerName: 'InterDigital', dispositif: 'LabCom', stage: 'Terminé / abandonné', montant: 700000 }
];
const rows = p.pipelineRows(PROJECTS);
eq(rows.map(r => r.stage), ['Idée', 'Premier échange', 'Qualification', "Recherche d'équipe", 'Montage', 'Contractualisation'],
  'pipelineRows: étapes closes exclues du pipeline');
eq(rows.map(r => r.count), [1, 2, 2, 1, 2, 1], 'pipelineRows: nombre de projets par étape');
eq(rows.map(r => r.montant), [0, 320000, 620000, 2400000, 2060000, 135000], 'pipelineRows: montant cumulé par étape');
eq(rows.map(r => r.ratio), [0.5, 1, 1, 0.5, 1, 0.5],
  'pipelineRows: ratio relatif à l\'étape la plus fournie (largeur de barre)');
eq(p.pipelineRows([]), [], 'pipelineRows: aucun projet -> aucune ligne');
// Une étape déclarée dans Grist mais sans projet doit apparaître vide.
eq(p.pipelineRows(PROJECTS, ['Idée', 'Premier échange', 'Qualification', "Recherche d'équipe", 'Montage', 'Contractualisation', 'Projet lancé'])
  .find(r => r.stage === 'Projet lancé').count, 0,
  'pipelineRows: une étape sans projet reste affichée (colonne vide)');

const cols = p.kanbanColumns(PROJECTS, ['Idée', 'Qualification', 'Terminé / abandonné']);
eq(cols.map(c => c.stage), ['Idée', 'Qualification', 'Terminé / abandonné'],
  'kanbanColumns: les étapes closes restent des colonnes (carte abandonnée atteignable)');
eq(cols.map(c => c.count), [1, 2, 1], 'kanbanColumns: cartes par colonne');
eq(cols[1].montant, 620000, 'kanbanColumns: montant cumulé de colonne');

// ---- Indicateurs ----
const KPI_PARTNERS = PARTNERS.concat([{ id: 13, name: 'Thales', lastContact: D(2026, 9, 5) }]);
const KPI_ACTIONS = ACTIONS;
const KPI_PROJECTS = PROJECTS.map(pr => pr.id === 8 ? Object.assign({}, pr, { depotDue: D(2026, 9, 17) }) : pr);
const kpis = p.computeKpis({ projects: KPI_PROJECTS, partners: KPI_PARTNERS, actions: KPI_ACTIONS }, NOW);
eq(kpis.actionsRetard, 1, 'kpi: 1 action en retard');
eq(kpis.actionsSemaine, 4, 'kpi: actions à échéance sous 7 jours (aujourd\'hui inclus)');
eq(kpis.partenairesARelancer, 4, 'kpi: partenaires sans contact depuis 30 j');
eq(kpis.projetsEnDiscussion, 6, 'kpi: projets en discussion (Idée -> Recherche d\'équipe)');
eq(kpis.pipelinePondere, 5215000, 'kpi: pipeline pondéré = Qualification -> Contractualisation');
eq(p.formatMontantOrDash(kpis.pipelinePondere), '5,2 M€', 'kpi: pipeline pondéré affiché 5,2 M€');
eq(kpis.dossiersADeposer, 1, 'kpi: dossiers à déposer (date de dépôt à venir, pas encore lancés)');
eq(kpis.cifreIdentifiees, 3, 'kpi: CIFRE identifiées, hors étapes closes');
eq(p.computeKpis({}, NOW).pipelinePondere, 0, 'kpi: données vides -> pas d\'erreur');

// ---- Moteur de suggestions ----
const SUGG_DATA = {
  projects: [
    // Règle 1 : projet clos depuis plus de 60 j, aucun échange depuis.
    { id: 10, partnerId: 19, partnerName: 'InterDigital', dispositif: 'LabCom', stage: 'Terminé / abandonné', stageSince: D(2026, 7, 5) },
    // Règle 3 : dépôt à venir, lettres de soutien manquantes.
    { id: 11, partnerId: 20, partnerName: 'Zenika', dispositif: 'ANR PRCE', stage: 'Montage', depotDue: D(2026, 10, 15), piecesAttendues: 4, piecesRecues: 3 },
    // Projet actif de Kerlink, pour la règle 2.
    { id: 12, partnerId: 1, partnerName: 'Kerlink', dispositif: 'ANR PRCE', stage: 'Qualification' },
    { id: 13, partnerId: 1, partnerName: 'Kerlink', dispositif: 'CIFRE', stage: 'Montage' }
  ],
  partners: PARTNERS,
  interactions: [{ id: 1, partnerIds: [19], date: D(2026, 6, 1) }]
};
const suggestions = p.runSuggestionRules(SUGG_DATA, { now: NOW });
eq(suggestions.map(s => s.rule), ['projet-dormant', 'partenaire-silencieux', 'piece-manquante'],
  'suggestions: les trois règles produisent, dans l\'ordre du moteur');
eq(suggestions[0].label, "Planifier un point d'étape LabCom avec InterDigital",
  'suggestions: règle 1 — projet dormant');
eq(suggestions[0].why, 'Projet terminé depuis 65 j et aucun échange enregistré — opportunité de renouvellement.',
  'suggestions: règle 1 — justification chiffrée');
eq(suggestions[1].label, 'Reprendre contact avec Kerlink', 'suggestions: règle 2 — partenaire silencieux');
eq(suggestions[1].why, 'Dernier échange il y a 6 mois alors que 2 projets sont actifs avec ce partenaire.',
  'suggestions: règle 2 — justification lisible et chiffrée');
eq(suggestions[2].label, 'Demander une lettre de soutien à Zenika', 'suggestions: règle 3 — pièce manquante');
eq(suggestions[2].why, '3 lettres émises sur 4 attendues avant le dépôt du 15/10/2026.',
  'suggestions: règle 3 — justification datée');
eq(p.runSuggestionRules(SUGG_DATA, { now: NOW, dismissed: ['partenaire-silencieux:1'] }).map(s => s.rule),
  ['projet-dormant', 'piece-manquante'], 'suggestions: une suggestion acceptée ne revient pas');
eq(p.runSuggestionRules({}, { now: NOW }), [], 'suggestions: données vides -> aucune suggestion');
// Le moteur doit être extensible sans toucher au rendu, et une règle en
// échec ne doit pas emporter les autres.
const extra = { id: 'maison', run: () => [{ id: 'maison:1', label: 'Règle ajoutée', why: 'Parce que.' }] };
const broken = { id: 'cassee', run: () => { throw new Error('boom'); } };
// La règle cassée journalise son erreur : on la met en sourdine le temps de
// l'assertion, sinon la sortie des tests laisse croire à un échec.
const realError = sandbox.console.error;
sandbox.console = { ...console, error: () => {} };
eq(p.runSuggestionRules(SUGG_DATA, { now: NOW, rules: [broken, extra] }).map(s => s.label), ['Règle ajoutée'],
  'suggestions: moteur extensible, et une règle en échec est isolée');
sandbox.console = console;
void realError;

eq(p.lastInteractionFor([{ partnerIds: [1], date: 100 }, { partnerIds: [1], date: 300 }, { partnerIds: [2], date: 900 }], 1),
  300, 'lastInteractionFor: dernière date du partenaire, pas des autres');
eq(p.lastInteractionFor([], 1), null, 'lastInteractionFor: aucune interaction -> null');

console.log(`\n${pass} passed, ${fail} failed (pilotage)`);
process.exit(fail ? 1 : 0);
