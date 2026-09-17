// Logique métier du widget de pilotage (pilotage.html).
//
// Tout ce qui est calculable l'est ici, en fonctions pures : étapes de
// pipeline, regroupement par urgence, indicateurs, moteur de suggestions.
// Aucune de ces fonctions ne touche à `grist` ni au DOM — elles sont
// couvertes par tests/common.test.mjs.
//
// Écrit pour un <script> classique (pas de module), comme common.js, et
// chargé après lui : `normalizeKey`, `daysSince`, `formatMontantCompact`…
// viennent de là.

// ---------------------------------------------------------------------
// Étapes de pipeline
// ---------------------------------------------------------------------
// Le document Grist porte ses propres choix de "Statut" (aujourd'hui
// Prospection -> Abandonné ; la cible métier en compte huit, de "Idée" à
// "Terminé / abandonné"). Aucune liste n'est donc figée dans le widget :
// on lit les choix réels de la colonne et on les ordonne avec cette liste
// canonique, qui couvre les deux vocabulaires. Une valeur inconnue n'est
// jamais perdue, elle est simplement rangée à la fin.
//
// `families` sert aux indicateurs, qui sont définis par famille d'étape et
// pas par position — c'est ce qui les rend justes dans les deux
// vocabulaires. Une étape peut appartenir à plusieurs familles :
// Qualification est à la fois "en discussion" et dans le pipeline pondéré.
const PILOTAGE_STAGES = [
  { label: 'Idée',                families: ['discussion'] },
  { label: 'Prospection',         families: ['discussion'] },
  { label: 'Premier échange',     families: ['discussion'] },
  { label: 'Qualification',       families: ['discussion', 'pondere'] },
  { label: "Recherche d'équipe",  families: ['discussion', 'pondere'] },
  { label: 'Montage',             families: ['pondere'] },
  { label: 'Contractualisation',  families: ['pondere'] },
  { label: 'Projet lancé',        families: ['lance'] },
  { label: 'Concrétisé / En cours', families: ['lance'] },
  { label: 'Terminé',             families: ['termine'] },
  { label: 'Abandonné',           families: ['clos'] }
// La clé de comparaison est dérivée du libellé, pas saisie à côté : deux
// sources de vérité pour la même chose finiraient par diverger.
].map(s => Object.assign({ key: normalizeKey(s.label) }, s));

// Reconnaît un libellé d'étape quel que soit son orthographe dans le
// document. Correspondance exacte d'abord (accents/casse/séparateurs
// ignorés), puis sous-chaîne la plus longue — "Terminé / abandonné" doit
// rester distinct de "Abandonné", et l'exact-d'abord y suffit.
function matchStage(label) {
  const k = normalizeKey(label);
  if (!k) return null;
  const exact = PILOTAGE_STAGES.find(s => s.key === k);
  if (exact) return exact;
  const partial = PILOTAGE_STAGES
    .filter(s => k.includes(s.key) || s.key.includes(k))
    .sort((a, b) => b.key.length - a.key.length);
  return partial[0] || null;
}

// Position d'un libellé dans l'ordre canonique ; Infinity si inconnu, pour
// que les tris rangent les valeurs non reconnues après les autres.
function stageRank(label) {
  const stage = matchStage(label);
  return stage ? PILOTAGE_STAGES.indexOf(stage) : Infinity;
}

// Couleur de l'étape, pour lire la progression du pipeline d'un coup d'oeil.
// Les valeurs vivent dans le CSS (--stage-<clé>) et reprennent la
// progression de funnel déjà posée par les --status-* de common.css, pour
// qu'une opportunité garde la même couleur d'un widget à l'autre. Une étape
// que la liste canonique ne connaît pas retombe sur statusColor().
function stageColor(label) {
  // Une couleur enregistrée depuis le document gagne toujours : c'est celle
  // que porte la colonne Statut dans la table.
  const fromDoc = _statusStyles[normalizeKey(label)];
  if (fromDoc) return fromDoc.fill;
  const stage = matchStage(label);
  return stage ? 'var(--stage-' + stage.key + ')' : statusColor(label);
}

// Couleur de texte lisible sur la couleur d'étape — le jaune d'une
// contractualisation demande un texte sombre.
function stageTextColor(label) {
  const fromDoc = _statusStyles[normalizeKey(label)];
  if (fromDoc) return fromDoc.text;
  return statusTextColor(label);
}

function stageFamilies(label) {
  const stage = matchStage(label);
  return stage ? stage.families : [];
}

function isStageIn(label, family) {
  return stageFamilies(label).includes(family);
}

// Ordonne les libellés d'étape tels qu'ils existent dans le document.
// Les valeurs inconnues gardent leur ordre d'arrivée, à la fin.
function orderStages(labels) {
  const seen = [];
  (labels || []).forEach(l => {
    const v = (l === null || l === undefined) ? '' : String(l);
    if (v && !seen.includes(v)) seen.push(v);
  });
  return seen
    .map((label, i) => ({ label, rank: stageRank(label), i }))
    .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
    .map(o => o.label);
}

// ---------------------------------------------------------------------
// Dispositifs
// ---------------------------------------------------------------------
// Le "Type" d'opportunité porte le dispositif. Les couleurs vivent dans le
// CSS (classes .tag-<key>) ; ici on ne fait que reconnaître la famille.
const PILOTAGE_DISPOSITIFS = [
  { key: 'cifre',    label: 'CIFRE',                   match: ['cifre'] },
  { key: 'chaire',   label: 'Chaire',                  match: ['chaire'] },
  { key: 'labcom',   label: 'LabCom',                  match: ['labcom', 'laboratoirecommun'] },
  { key: 'national', label: 'Projet national',         match: ['national', 'anr', 'prce', 'prc'] },
  { key: 'europe',   label: 'Projet européen',         match: ['europeen', 'europe', 'horizon'] },
  { key: 'stage',    label: 'Stage / projet étudiant', match: ['stage', 'etudiant', 'projetetudiant'] },
  { key: 'interne',  label: 'Projet interne',          match: ['interne', 'internes'] }
];

function dispositifOf(type) {
  const k = normalizeKey(type);
  if (!k) return null;
  return PILOTAGE_DISPOSITIFS.find(d => d.match.some(m => k.includes(m))) || null;
}

// Classe CSS de l'étiquette de dispositif — 'autre' pour tout ce qui n'est
// pas un des six dispositifs structurants (autre collaboration).
function dispositifClass(type) {
  const d = dispositifOf(type);
  return 'tag-' + (d ? d.key : 'autre');
}

// Une thèse/opportunité compte comme CIFRE dès que le type la mentionne
// (mêmes règles que le dashboard CIFRE : correspondance de sous-chaîne,
// pour attraper "CIFRE + ANR" comme "CIFRE").
function isCifre(type) {
  return normalizeKey(type).includes('cifre');
}

// ---------------------------------------------------------------------
// Montants
// ---------------------------------------------------------------------
// Les montants sont stockés en euros dans Grist et affichés compacts
// (145 k€, 1,2 M€). Un montant nul ou absent s'affiche "—" : c'est une
// information ("pas encore chiffré"), pas un zéro.
function formatMontantOrDash(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || isNaN(n) || n === 0) return '—';
  return formatMontantCompact(n);
}

function sumMontants(projects) {
  return (projects || []).reduce((total, p) => {
    const n = Number(p && p.montant);
    return total + (isNaN(n) ? 0 : n);
  }, 0);
}

// Tous les porteurs d'une liste de projets, en une ligne lisible. Aucune
// troncature silencieuse : afficher « 5 » projets et seulement quatre noms
// fait douter du chiffre, donc au-delà de MAX_HOLDERS le reste est annoncé
// (« +2 »). Un projet sans partenaire est compté comme interne plutôt
// qu'omis — c'est une catégorie, pas un trou.
const MAX_HOLDERS = 5;

function projectHolders(projects, max) {
  const limit = max || MAX_HOLDERS;
  const names = [];
  let internes = 0;
  (projects || []).forEach(p => {
    const ids = (p && p.partnerIds) || [];
    if (!ids.length) { internes++; return; }
    String((p && p.partnerName) || '').split(', ').forEach(n => {
      const name = n.trim();
      if (name && !names.includes(name)) names.push(name);
    });
  });
  if (internes) names.push(internes > 1 ? internes + ' projets internes' : 'projet interne');
  if (names.length <= limit) return names.join(' · ');
  return names.slice(0, limit).join(' · ') + ' +' + (names.length - limit);
}

// ---------------------------------------------------------------------
// Urgence des actions
// ---------------------------------------------------------------------
// Les groupes sont calculés à l'affichage, jamais stockés : une action
// "cette semaine" devient "en retard" toute seule le jour venu.
const PILOTAGE_URGENCES = [
  { key: 'retard',     label: 'En retard',      rule: 'À TRAITER EN PRIORITÉ', tone: 'danger' },
  { key: 'aujourdhui', label: "Aujourd'hui",    rule: '',                      tone: 'warn' },
  { key: 'semaine',    label: 'Cette semaine',  rule: 'ÉCHÉANCE SOUS 7 JOURS', tone: 'ok' },
  { key: 'plustard',   label: 'Plus tard',      rule: '',                      tone: 'muted' },
  { key: 'sansdate',   label: 'Sans échéance',  rule: 'À DATER',               tone: 'muted' },
  // Dernier groupe : ce qu'on a volontairement repoussé ne doit pas encombrer
  // le haut de la liste, mais rester consultable.
  { key: 'differee',   label: 'Différées',      rule: 'PAS AVANT LEUR DATE DE DÉBUT', tone: 'muted' }
];

// Priorité explicite, quand le document la porte. Elle tranche à échéance
// égale — deux dossiers le même jour n'ont pas le même poids — et ne
// remplace pas l'urgence : une tâche « basse » en retard reste en retard.
const PILOTAGE_PRIORITES = [
  { key: 'haute',   rank: 0, label: 'Haute',   match: ['haute', 'hautepriorite', 'urgent', 'p1', '1'], tone: 'danger' },
  { key: 'normale', rank: 1, label: 'Normale', match: ['normale', 'moyenne', 'p2', '2'],               tone: 'muted' },
  { key: 'basse',   rank: 2, label: 'Basse',   match: ['basse', 'faible', 'p3', 'p4', '3', '4'],       tone: 'muted' }
];

function prioriteOf(value) {
  const k = normalizeKey(value);
  if (!k) return null;
  return PILOTAGE_PRIORITES.find(p => p.match.includes(k)) ||
    PILOTAGE_PRIORITES.find(p => p.match.some(m => k.includes(m))) || null;
}

// Rang de tri : sans priorité renseignée, on se place au milieu, pour ne
// devancer ni doubler ce qui est explicitement marqué.
function prioriteRank(value) {
  const p = prioriteOf(value);
  return p ? p.rank : 1;
}

// Une action différée n'est pas encore à faire : tant que sa date de début
// n'est pas venue, elle n'a rien à faire dans la liste du jour.
function isDeferred(action, now) {
  const d = daysSince(action && action.start, now);
  return d !== null && d < 0;
}

// daysSince est positif dans le passé, négatif dans le futur.
function urgenceOf(due, now) {
  const d = daysSince(due, now);
  if (d === null) return 'sansdate';
  if (d > 0) return 'retard';
  if (d === 0) return 'aujourdhui';
  if (d >= -7) return 'semaine';
  return 'plustard';
}

// L'urgence d'une action, différé compris : une action qui ne commence que
// la semaine prochaine se range dans « Différées », quelle que soit son
// échéance, pour ne pas peser sur aujourd'hui.
function urgenceOfAction(action, now) {
  if (isDeferred(action, now)) return 'differee';
  return urgenceOf(action && action.due, now);
}

// Nombre de jours de retard (0 si l'action n'est pas en retard).
function daysLate(due, now) {
  const d = daysSince(due, now);
  return d !== null && d > 0 ? d : 0;
}

// Regroupe les actions ouvertes par urgence, dans l'ordre des groupes, en
// omettant les groupes vides. Chaque groupe est trié par échéance (la plus
// proche d'abord), puis par enjeu décroissant à échéance égale.
function groupActionsByUrgence(actions, now) {
  const buckets = {};
  (actions || []).filter(a => !a.done).forEach(a => {
    const key = urgenceOfAction(a, now);
    (buckets[key] = buckets[key] || []).push(a);
  });
  return PILOTAGE_URGENCES
    .filter(g => buckets[g.key] && buckets[g.key].length)
    .map(g => ({
      key: g.key,
      label: g.label,
      rule: g.rule,
      tone: g.tone,
      actions: buckets[g.key].sort((a, b) => {
        // La priorité d'abord : à l'intérieur d'un même groupe d'urgence,
        // c'est elle qui dit par quoi commencer.
        const pa = prioriteRank(a.priorite), pb = prioriteRank(b.priorite);
        if (pa !== pb) return pa - pb;
        const da = daysSince(a.due, now), db = daysSince(b.due, now);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        if (db !== da) return db - da; // le plus en retard / le plus proche d'abord
        return (Number(b.montant) || 0) - (Number(a.montant) || 0);
      })
    }));
}

// ---------------------------------------------------------------------
// Effort estimé
// ---------------------------------------------------------------------
// Heuristique assumée : sans colonne dédiée dans Grist, l'effort est
// déduit de la nature de l'action (relancer / envoyer / monter un dossier)
// puis de l'étape. Le jour où une colonne "Effort" existe, il suffira de
// la lire et de garder ceci en repli.
const EFFORT_RULES = [
  { minutes: 15,  match: ['relanc', 'rappel', 'confirmer', 'accuser'] },
  { minutes: 30,  match: ['appeler', 'telephon', 'reprendrecontact', 'demander', 'reclamer', 'obtenir'] },
  { minutes: 45,  match: ['envoyer', 'transmettre', 'partager', 'planifier', 'organiser'] },
  { minutes: 60,  match: ['reunion', 'point', 'rencontrer', 'rediger', 'ecrire'] },
  { minutes: 90,  match: ['note', 'comparatif', 'synthese', 'preparer', 'analyser'] },
  { minutes: 120, match: ['dossier', 'budget', 'budgetaire', 'montage', 'deposer', 'completer', 'convention'] }
];

const EFFORT_BY_STAGE = { montage: 120, contractualisation: 60, recherchedequipe: 90 };

function estimatedEffortMinutes(action) {
  // Une durée saisie vaut mieux que la meilleure heuristique : c'est celle
  // qui rend la charge de la journée juste.
  const saisie = Number(action && action.duree);
  if (saisie > 0) return saisie;
  const text = normalizeKey((action && action.label) || '');
  // La règle la plus lourde qui correspond gagne : "compléter le volet
  // budgétaire du dossier" est un dossier avant d'être un "compléter".
  const hits = EFFORT_RULES.filter(r => r.match.some(m => text.includes(m)));
  if (hits.length) return Math.max.apply(null, hits.map(r => r.minutes));
  const stage = matchStage(action && action.stage);
  if (stage && EFFORT_BY_STAGE[stage.key]) return EFFORT_BY_STAGE[stage.key];
  return 30;
}

function formatEffort(minutes) {
  const m = Number(minutes);
  if (!m || isNaN(m) || m <= 0) return '';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? h + ' h ' + String(rest).padStart(2, '0') : h + ' h';
}

// ---------------------------------------------------------------------
// Motif : pourquoi cette action est là
// ---------------------------------------------------------------------
// Ordre = priorité. La première règle qui s'applique donne le motif.
const MOTIF_RULES = [
  {
    id: 'suggestion',
    test: a => a.origin === 'suggestion',
    motif: () => ({ label: 'SUGGESTION ACCEPTÉE', tone: 'muted' })
  },
  {
    id: 'promesse',
    test: (a, ctx) => daysLate(a.due, ctx.now) > 0,
    motif: (a, ctx) => ({ label: 'PROMESSE NON TENUE · ' + daysLate(a.due, ctx.now) + ' J', tone: 'danger' })
  },
  {
    id: 'depot',
    test: (a, ctx) => a.depotDue !== null && a.depotDue !== undefined &&
      daysSince(a.depotDue, ctx.now) < 0 && daysSince(a.depotDue, ctx.now) >= -60,
    motif: (a, ctx) => ({
      label: ('DÉPÔT ' + (a.depotLabel || '') + ' DANS ' + (-daysSince(a.depotDue, ctx.now)) + ' J').replace(/\s+/g, ' ').toUpperCase(),
      tone: 'warn'
    })
  },
  {
    id: 'enjeu',
    test: a => (Number(a.montant) || 0) >= 1000000,
    motif: a => ({ label: 'BLOQUE ' + formatMontantCompact(a.montant), tone: 'warn' })
  },
  {
    id: 'relance',
    test: (a, ctx) => a.partnerLastContact !== null && a.partnerLastContact !== undefined &&
      daysSince(a.partnerLastContact, ctx.now) >= ctx.relanceSeuil,
    motif: () => ({ label: 'PARTENAIRE À RELANCER', tone: 'warn' })
  },
  {
    id: 'sansequipe',
    test: (a, ctx) => isStageIn(a.stage, 'discussion') && !a.hasTeam &&
      daysSince(a.stageSince, ctx.now) !== null && daysSince(a.stageSince, ctx.now) >= 21,
    motif: (a, ctx) => ({ label: 'IDÉE SANS ÉQUIPE DEPUIS ' + daysSince(a.stageSince, ctx.now) + ' J', tone: 'warn' })
  },
  {
    id: 'attendu',
    test: a => normalizeKey(a.label).match(/^(envoyer|transmettre|partager)/),
    motif: () => ({ label: 'ATTENDU PAR LE PARTENAIRE', tone: 'ok' })
  }
];

function actionMotif(action, options) {
  const ctx = Object.assign({ now: undefined, relanceSeuil: 30 }, options || {});
  const a = action || {};
  for (const rule of MOTIF_RULES) {
    if (rule.test(a, ctx)) return Object.assign({ id: rule.id }, rule.motif(a, ctx));
  }
  return null;
}

// ---------------------------------------------------------------------
// Partenaires à relancer
// ---------------------------------------------------------------------
function relanceTone(days) {
  if (days === null || days === undefined) return 'muted';
  if (days >= 90) return 'danger';
  if (days >= 60) return 'warn';
  return 'ok';
}

// Ancienneté lisible : au-delà de 60 jours on bascule en mois, comme la
// maquette ("6 mois" plutôt que "183 j").
function formatAnciennete(days) {
  if (days === null || days === undefined) return '';
  if (days <= 0) return "aujourd'hui";
  if (days < 60) return days + ' jours';
  const months = Math.round(days / 30);
  return months >= 12 ? Math.round(months / 12) + ' an' + (months >= 24 ? 's' : '') : months + ' mois';
}

// Partenaires sans contact depuis `seuil` jours, du plus ancien au plus
// récent. Un partenaire sans aucun contact enregistré remonte en tête : ne
// jamais avoir échangé est plus urgent qu'avoir échangé il y a longtemps.
function partnersToFollowUp(partners, options) {
  const opts = Object.assign({ seuil: 30, now: undefined }, options || {});
  return (partners || [])
    .map(p => ({ partner: p, days: daysSince(p.lastContact, opts.now) }))
    .filter(o => o.days === null || o.days >= opts.seuil)
    .sort((a, b) => {
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return -1;
      if (b.days === null) return 1;
      return b.days - a.days;
    });
}

// ---------------------------------------------------------------------
// Pipeline et indicateurs
// ---------------------------------------------------------------------
// Une ligne par étape : nombre de projets, montant cumulé, et `ratio`
// relatif à l'étape la plus fournie (largeur de la barre). Les étapes
// closes ("Terminé / abandonné") sont hors pipeline.
function pipelineRows(projects, stages) {
  const labels = stages && stages.length
    ? orderStages(stages)
    : orderStages((projects || []).map(p => p.stage));
  const rows = labels
    .filter(label => !isStageIn(label, 'clos') || isStageIn(label, 'termine'))
    .map(label => {
      const key = normalizeKey(label);
      const inStage = (projects || []).filter(p => normalizeKey(p.stage) === key);
      return { stage: label, count: inStage.length, montant: sumMontants(inStage), ratio: 0 };
    });
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  rows.forEach(r => { r.ratio = max ? r.count / max : 0; });
  return rows;
}

// Colonnes du Kanban : toutes les étapes du document, closes comprises —
// une carte abandonnée doit rester atteignable.
function kanbanColumns(projects, stages) {
  const labels = stages && stages.length
    ? orderStages(stages)
    : orderStages((projects || []).map(p => p.stage));
  return labels.map(label => {
    const key = normalizeKey(label);
    const cards = (projects || []).filter(p => normalizeKey(p.stage) === key);
    return { stage: label, cards, count: cards.length, montant: sumMontants(cards) };
  });
}

// Les sept indicateurs du bandeau, tous déduits des données.
function computeKpis(data, now) {
  const d = Object.assign({ projects: [], partners: [], actions: [] }, data || {});
  const open = d.actions.filter(a => !a.done);
  const discussion = d.projects.filter(p => isStageIn(p.stage, 'discussion'));
  const pondere = d.projects.filter(p => isStageIn(p.stage, 'pondere'));
  // "Dossiers à déposer" : un dispositif à date de dépôt encore à venir et
  // pas encore contractualisé — c'est ce qui reste à rendre.
  const aDeposer = d.projects.filter(p => {
    const left = daysSince(p.depotDue, now);
    return left !== null && left < 0 && !isStageIn(p.stage, 'lance') && !isStageIn(p.stage, 'clos');
  });
  const cifre = d.projects.filter(p => isCifre(p.dispositif) && !isStageIn(p.stage, 'clos'));
  // Les totaux qui donnent son sens à chaque compte : « 5 partenaires à
  // relancer » ne dit rien sans savoir s'il y en a six ou soixante. Ils
  // servent de dénominateur aux jauges du tableau de bord.
  const actifs = d.projects.filter(p => !isStageIn(p.stage, 'clos'));
  const avecProjet = d.partners.filter(p => !p.prospect &&
    actifs.some(pr => (pr.partnerIds || []).includes(p.id)));
  return {
    actionsRetard: open.filter(a => urgenceOf(a.due, now) === 'retard').length,
    actionsSemaine: open.filter(a => ['aujourdhui', 'semaine'].includes(urgenceOf(a.due, now))).length,
    partenairesARelancer: partnersToFollowUp(d.partners, { seuil: 30, now }).length,
    projetsEnDiscussion: discussion.length,
    pipelinePondere: sumMontants(pondere),
    dossiersADeposer: aDeposer.length,
    cifreIdentifiees: cifre.length,
    cifreLancees: cifre.filter(p => isStageIn(p.stage, 'lance')).length,
    actionsOuvertes: open.length,
    projetsActifs: actifs.length,
    partenairesActifs: avecProjet.length,
    pipelineTotal: sumMontants(actifs)
  };
}

// ---------------------------------------------------------------------
// Moteur de suggestions
// ---------------------------------------------------------------------
// Chaque règle reçoit l'ensemble des données et rend des suggestions
// {id, label, why, partnerId, projectId}. Ajouter une règle = ajouter une
// entrée ici, sans toucher au rendu.
const PILOTAGE_SUGGESTION_RULES = [
  {
    id: 'projet-dormant',
    // Un projet clos depuis plus de 60 jours sans échange depuis : le
    // renouvellement se joue maintenant, pas au moment où on y repense.
    run(data, ctx) {
      return (data.projects || [])
        .filter(p => isStageIn(p.stage, 'clos') || isStageIn(p.stage, 'lance'))
        .filter(p => {
          const since = daysSince(p.stageSince, ctx.now);
          if (since === null || since <= 60) return false;
          const last = lastInteractionFor(data.interactions, p.partnerId);
          return last === null || daysSince(last, ctx.now) > since;
        })
        .map(p => ({
          id: 'projet-dormant:' + p.id,
          label: "Planifier un point d'étape " + (p.dispositif || 'projet') + ' avec ' + (p.partnerName || 'ce partenaire'),
          why: 'Projet terminé depuis ' + daysSince(p.stageSince, ctx.now) + ' j et aucun échange enregistré — opportunité de renouvellement.',
          partnerId: p.partnerId,
          projectId: p.id
        }));
    }
  },
  {
    id: 'partenaire-silencieux',
    // Sans échange depuis plus de 90 jours alors qu'un projet est actif :
    // le silence coûte plus cher quand il y a quelque chose en cours.
    run(data, ctx) {
      return (data.partners || [])
        .filter(p => {
          const since = daysSince(p.lastContact, ctx.now);
          if (since === null || since <= 90) return false;
          return (data.projects || []).some(pr => pr.partnerId === p.id &&
            !isStageIn(pr.stage, 'clos'));
        })
        .map(p => {
          const actifs = (data.projects || []).filter(pr => pr.partnerId === p.id && !isStageIn(pr.stage, 'clos')).length;
          return {
            id: 'partenaire-silencieux:' + p.id,
            label: 'Reprendre contact avec ' + p.name,
            why: 'Dernier échange il y a ' + formatAnciennete(daysSince(p.lastContact, ctx.now)) +
              ' alors que ' + actifs + ' projet' + (actifs > 1 ? 's sont actifs' : ' est actif') + ' avec ce partenaire.',
            partnerId: p.id,
            projectId: null
          };
        });
    }
  },
  {
    id: 'piece-manquante',
    // Une pièce attendue (lettre de soutien…) manquante avant une date de
    // dépôt : réclamer maintenant ou déposer incomplet.
    run(data, ctx) {
      return (data.projects || [])
        .filter(p => {
          const left = daysSince(p.depotDue, ctx.now);
          return left !== null && left < 0 && (p.piecesAttendues || 0) > (p.piecesRecues || 0);
        })
        .map(p => ({
          id: 'piece-manquante:' + p.id,
          label: 'Demander une lettre de soutien à ' + (p.partnerName || 'ce partenaire'),
          why: (p.piecesRecues || 0) + ' lettres émises sur ' + p.piecesAttendues +
            ' attendues avant le dépôt du ' + formatDate(p.depotDue) + '.',
          partnerId: p.partnerId,
          projectId: p.id
        }));
    }
  }
];

// Date de la dernière interaction avec un partenaire (null si aucune).
function lastInteractionFor(interactions, partnerId) {
  const dates = (interactions || [])
    .filter(i => (i.partnerIds || []).includes(partnerId))
    .map(i => i.date)
    .filter(d => d !== null && d !== undefined && d !== '');
  if (!dates.length) return null;
  return dates.reduce((max, d) => (d > max ? d : max), dates[0]);
}

// ---------------------------------------------------------------------
// Saisie rapide
// ---------------------------------------------------------------------
// Une action se capture en une ligne, l'échéance et les rattachements pris
// dans la phrase : « Relancer @Thales sur #TrustAI lundi » vaut trois champs
// remplis. C'est le geste qui coûte le moins entre deux réunions, et le
// motif retenu par les gestionnaires de tâches qui soignent la capture.
//
// Ce qui est reconnu se retire de l'intitulé — sinon la date se retrouverait
// écrite deux fois, dans le texte et dans la colonne.
const PILOTAGE_JOURS = [
  ['dimanche', 0], ['lundi', 1], ['mardi', 2], ['mercredi', 3],
  ['jeudi', 4], ['vendredi', 5], ['samedi', 6]
];

const PILOTAGE_LIAISONS = ['sur', 'pour', 'de', 'du', 'des', 'avec', 'a', 'et',
  'le', 'la', 'les', 'en', 'dans', 'chez', 'au', 'aux'];

// Minuit UTC du jour de `now`, en secondes : le format des dates Grist.
function dayStart(now) {
  const d = now === undefined ? new Date() : (typeof now === 'number' ? new Date(now * 1000) : new Date(now));
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

// Prochaine occurrence d'un jour de la semaine, aujourd'hui exclu : « lundi »
// dit un lundi à venir, pas celui qui commence.
function nextWeekday(now, target) {
  const base = dayStart(now);
  const jour = new Date(base * 1000).getUTCDay();
  const ecart = ((target - jour) + 7) % 7 || 7;
  return base + ecart * 86400;
}

function parseQuickAction(text, now) {
  let reste = String(text === null || text === undefined ? '' : text);
  let due;

  // Un jeton n'est retenu qu'entouré de limites de mot, pour ne pas mutiler
  // un intitulé qui contiendrait « demain » dans une autre tournure.
  // La limite de gauche est non capturante : un groupe de plus décalerait les
  // indices que les motifs datés lisent (m[1] = le nombre de jours).
  const consomme = (motif, valeur) => {
    if (due !== undefined) return;
    const re = new RegExp('(?:^|\\s)' + motif + '(?=\\s|$|[.,;])', 'i');
    const m = reste.match(re);
    if (!m) return;
    due = typeof valeur === 'function' ? valeur(m) : valeur;
    reste = (reste.slice(0, m.index) + ' ' + reste.slice(m.index + m[0].length)).trim();
  };

  consomme('sans\\s+(?:date|echeance|échéance)', null);
  consomme("aujourd'?hui|ce\\s+soir", dayStart(now));
  consomme('apres[-\\s]demain|après[-\\s]demain', dayStart(now) + 2 * 86400);
  consomme('demain', dayStart(now) + 86400);
  consomme('(?:la\\s+)?semaine\\s+prochaine', () => nextWeekday(now, 1));
  consomme('dans\\s+(\\d+)\\s*(?:j|jours?)', (m) => dayStart(now) + Number(m[1]) * 86400);
  consomme('dans\\s+(\\d+)\\s*(?:s|semaines?)', (m) => dayStart(now) + Number(m[1]) * 7 * 86400);
  consomme('dans\\s+(\\d+)\\s*mois', (m) => dayStart(now) + Number(m[1]) * 30 * 86400);
  consomme('\\+(\\d+)j', (m) => dayStart(now) + Number(m[1]) * 86400);
  consomme('\\+(\\d+)s', (m) => dayStart(now) + Number(m[1]) * 7 * 86400);
  // JJ/MM, JJ/MM/AA ou JJ/MM/AAAA. Une date déjà passée vise l'an prochain :
  // « le 15/01 » saisi en décembre parle de janvier qui vient.
  consomme('(?:le\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?', (m) => {
    const jour = Number(m[1]);
    const mois = Number(m[2]) - 1;
    const base = new Date(dayStart(now) * 1000);
    let an = m[3] ? Number(m[3]) : base.getUTCFullYear();
    if (an < 100) an += 2000;
    let ts = Math.floor(Date.UTC(an, mois, jour) / 1000);
    if (!m[3] && ts < dayStart(now)) ts = Math.floor(Date.UTC(an + 1, mois, jour) / 1000);
    return ts;
  });
  PILOTAGE_JOURS.forEach(([nom, idx]) => {
    consomme('(?:' + nom + ')(?:\\s+prochain)?', () => nextWeekday(now, idx));
  });

  // @partenaire et #opportunité : le texte qui suit, jusqu'au jeton suivant.
  // Les mots de liaison finaux appartiennent à la phrase et non au nom —
  // « @Thales sur #TrustAI » nomme Thales, puis enchaîne — donc ils
  // retournent dans l'intitulé.
  const prendre = (marqueur) => {
    const re = new RegExp('(?:^|\\s)' + marqueur + '([^@#]+)');
    const m = reste.match(re);
    if (!m) return '';
    const mots = m[1].trim().replace(/[.,;]$/, '').split(/\s+/).filter(Boolean);
    let rendu = '';
    while (mots.length > 1 && PILOTAGE_LIAISONS.includes(normalizeKey(mots[mots.length - 1]))) {
      rendu = mots.pop() + (rendu ? ' ' + rendu : '');
    }
    reste = (reste.slice(0, m.index) + ' ' + rendu + ' ' +
      reste.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
    return mots.join(' ');
  };
  // Priorité et durée : « !! » pour haute, « ! » pour basse (la normale est
  // le défaut, elle n'a pas à se dire), « ~30min » ou « ~2h » pour la durée.
  let priorite = '';
  let duree = null;
  const jeton = (motif, garde) => {
    const re = new RegExp('(?:^|\\s)' + motif + '(?=\\s|$|[.,;])', 'i');
    const m = reste.match(re);
    if (!m) return false;
    garde(m);
    reste = (reste.slice(0, m.index) + ' ' + reste.slice(m.index + m[0].length)).trim();
    return true;
  };
  jeton('!!|p1', () => { priorite = 'Haute'; }) ||
    jeton('!|p3|p4', () => { priorite = 'Basse'; });
  jeton('~(\\d+)\\s*(?:min|mn|m)', (m) => { duree = Number(m[1]); }) ||
    jeton('~(\\d+(?:[.,]\\d+)?)\\s*(?:h|heures?)', (m) => {
      duree = Math.round(parseFloat(m[1].replace(',', '.')) * 60);
    });

  const partnerHint = prendre('@');
  const projectHint = prendre('#');

  // Retirer « @Zenika » de « Relancer @Zenika sur … » laisse un « sur » en
  // suspens : on le retire à son tour, sinon l'intitulé enregistré ne se lit
  // plus. Seulement après un rattachement — ailleurs, la préposition est
  // celle que l'auteur a voulue.
  let label = reste.replace(/\s{2,}/g, ' ').trim();
  if (partnerHint || projectHint) {
    const mots = label.split(/\s+/).filter(Boolean);
    while (mots.length && PILOTAGE_LIAISONS.includes(normalizeKey(mots[mots.length - 1]))) mots.pop();
    label = mots.join(' ');
  }

  return { label, due: due === undefined ? null : due, partnerHint, projectHint, priorite, duree };
}

// ---------------------------------------------------------------------
// Récurrence
// ---------------------------------------------------------------------
// Une relance périodique ne se retape pas chaque fois : cocher l'action
// crée la suivante. La règle est écrite en clair dans le document
// (« chaque lundi », « tous les 30 jours »), lisible sans le widget.
//
// Rend { kind, n, weekday } ou null si la case ne dit rien d'exploitable.
function parseRecurrence(text) {
  const k = normalizeKey(text);
  if (!k) return null;
  const jour = PILOTAGE_JOURS.find(([nom]) => k.includes(normalizeKey(nom)));
  if (jour && /(chaque|tous|toutes)/.test(k)) return { kind: 'weekday', weekday: jour[1], n: 1 };
  const jours = k.match(/(?:tous|toutes)?les?(\d+)jours?/) || k.match(/(\d+)jours?/);
  if (jours) return { kind: 'days', n: Number(jours[1]) };
  const semaines = k.match(/(\d+)semaines?/);
  if (semaines) return { kind: 'days', n: Number(semaines[1]) * 7 };
  const mois = k.match(/(\d+)mois/);
  if (mois) return { kind: 'months', n: Number(mois[1]) };
  if (k.includes('quotidien') || k.includes('chaquejour')) return { kind: 'days', n: 1 };
  if (k.includes('hebdo') || k.includes('chaquesemaine')) return { kind: 'days', n: 7 };
  if (k.includes('mensuel') || k.includes('chaquemois')) return { kind: 'months', n: 1 };
  if (k.includes('trimestriel')) return { kind: 'months', n: 3 };
  if (k.includes('annuel') || k.includes('chaqueannee')) return { kind: 'months', n: 12 };
  return null;
}

// Échéance de l'occurrence suivante. On part de l'échéance courante quand
// elle est à venir, sinon d'aujourd'hui : une relance mensuelle oubliée
// pendant trois mois repart de maintenant, elle ne rattrape pas le retard.
function nextOccurrence(rule, due, now) {
  const spec = typeof rule === 'string' ? parseRecurrence(rule) : rule;
  if (!spec) return null;
  const base = (due !== null && due !== undefined && daysSince(due, now) <= 0)
    ? due : dayStart(now);
  if (spec.kind === 'weekday') return nextWeekday(base, spec.weekday);
  if (spec.kind === 'days') return base + spec.n * 86400;
  if (spec.kind === 'months') {
    const d = new Date(base * 1000);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + spec.n, d.getUTCDate()) / 1000);
  }
  return null;
}

// Repères de report, pour solder une action en retard sans ouvrir de
// formulaire — le geste de triage le plus fréquent.
function snoozeTargets(now) {
  return [
    { key: 'demain', label: 'Demain', due: dayStart(now) + 86400 },
    { key: 'lundi', label: 'Lundi', due: nextWeekday(now, 1) },
    { key: 'semaine', label: '+1 semaine', due: dayStart(now) + 7 * 86400 }
  ];
}

// Charge d'une journée : la somme des efforts estimés, pour voir qu'on a
// prévu huit heures de travail dans une journée qui n'en compte pas tant.
function chargeOf(actions) {
  return (actions || []).filter(a => !a.done)
    .reduce((total, a) => total + estimatedEffortMinutes(a), 0);
}

// Passe toutes les règles et retire ce qui est déjà couvert par une action
// existante ou déjà écarté : une suggestion qu'on a déjà acceptée n'a plus
// à être proposée.
function runSuggestionRules(data, options) {
  const ctx = Object.assign({ now: undefined }, options || {});
  const taken = new Set(ctx.dismissed || []);
  const rules = ctx.rules || PILOTAGE_SUGGESTION_RULES;
  const out = [];
  rules.forEach(rule => {
    let found = [];
    try { found = rule.run(data || {}, ctx) || []; }
    catch (err) { console.error('Règle de suggestion en échec : ' + rule.id, err); }
    found.forEach(s => {
      if (taken.has(s.id) || out.some(o => o.id === s.id)) return;
      out.push(Object.assign({ rule: rule.id }, s));
    });
  });
  return out;
}

// Exposé pour les tests Node (vm) ; sans effet dans le navigateur.
if (typeof window !== 'undefined') {
  window.pilotage = {
    PILOTAGE_STAGES, PILOTAGE_URGENCES, PILOTAGE_DISPOSITIFS, PILOTAGE_SUGGESTION_RULES,
    PILOTAGE_PRIORITES, prioriteOf, prioriteRank, isDeferred, urgenceOfAction,
    parseRecurrence, nextOccurrence,
    matchStage, stageRank, stageColor, stageTextColor, stageFamilies, isStageIn, orderStages,
    dispositifOf, dispositifClass, isCifre,
    formatMontantOrDash, sumMontants, projectHolders, MAX_HOLDERS,
    urgenceOf, daysLate, groupActionsByUrgence,
    estimatedEffortMinutes, formatEffort, actionMotif,
    relanceTone, formatAnciennete, partnersToFollowUp,
    pipelineRows, kanbanColumns, computeKpis,
    lastInteractionFor, runSuggestionRules,
    parseQuickAction, snoozeTargets, chargeOf, dayStart, nextWeekday
  };
}
