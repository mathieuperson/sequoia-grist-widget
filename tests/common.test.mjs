// Lightweight test harness (no framework) exercising the pure helper
// functions in common.js — everything that doesn't need a live grist.* API.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../common.js', import.meta.url), 'utf8');
// common.js is written for a <script> tag (no module system) — evaluate it
// in a sandbox and expose the functions we need via a `window` shim.
const sandbox = { console, window: {}, document: undefined };
vm.createContext(sandbox);
vm.runInContext(src + '\nwindow.exports = { escapeHtml, pilierClass, initials, formatValue, formatMontant, formatDate, gristDateToInputValue, inputValueToGristDate, statusColor, mapRecord, mapRecords, attachmentIdsFromValue, guessDisplayColumn, chipLabels, debounce, createFieldSaver };', sandbox);
const fn = sandbox.window.exports;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`FAIL  ${label}\n      got:      ${a}\n      expected: ${e}`); }
}

// ---- escapeHtml ----
eq(fn.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;', 'escapeHtml escapes all 5 entities');
eq(fn.escapeHtml(null), '', 'escapeHtml(null) -> empty string');
eq(fn.escapeHtml(undefined), '', 'escapeHtml(undefined) -> empty string');
eq(fn.escapeHtml(42), '42', 'escapeHtml coerces numbers to string');

// ---- pilierClass ----
eq(fn.pilierClass('IA fondamentale'), 'core', 'pilierClass: fondamentale -> core');
eq(fn.pilierClass('Core AI'), 'core', 'pilierClass: Core -> core');
eq(fn.pilierClass('IA & sécurité'), 'secu', 'pilierClass: sécurité -> secu');
eq(fn.pilierClass('IA & securite'), 'secu', 'pilierClass: securite (no accent) -> secu');
eq(fn.pilierClass('IA & environnement'), 'env', 'pilierClass: environnement -> env');
eq(fn.pilierClass('Autre chose'), 'autre', 'pilierClass: unknown value -> autre');
eq(fn.pilierClass(''), '', 'pilierClass: empty -> empty');
eq(fn.pilierClass(null), '', 'pilierClass: null -> empty');

// ---- initials ----
eq(fn.initials('Julien Faure'), 'JF', 'initials: two words');
eq(fn.initials('Orange'), 'O', 'initials: single word');
eq(fn.initials('  Ana   Belle  Cee '), 'AB', 'initials: caps at 2, trims whitespace');
eq(fn.initials(''), '?', 'initials: empty -> ?');
eq(fn.initials(null), '?', 'initials: null -> ?');

// ---- formatValue ----
eq(fn.formatValue(null), '', 'formatValue: null -> empty');
eq(fn.formatValue(undefined), '', 'formatValue: undefined -> empty');
eq(fn.formatValue('Orange'), 'Orange', 'formatValue: plain string passthrough');
eq(fn.formatValue(true), 'Oui', 'formatValue: true -> Oui');
eq(fn.formatValue(false), 'Non', 'formatValue: false -> Non');
eq(fn.formatValue(['L', 'Orange', 'Naval Group']), 'Orange, Naval Group', 'formatValue: encoded list joins with comma');
eq(fn.formatValue(['R', 12, 'Structures']), '', 'formatValue: raw Reference (R) -> empty (documented limitation)');

// ---- formatMontant ----
eq(fn.formatMontant(null), '', 'formatMontant: null -> empty');
eq(fn.formatMontant(''), '', 'formatMontant: empty string -> empty');
eq(fn.formatMontant('abc'), 'abc', 'formatMontant: non-numeric string passthrough');
eq(fn.formatMontant(1500).replace(/ | /g, ' '), '1 500 €', 'formatMontant: 1500 -> 1 500 € (fr-FR, no decimals)');

// ---- formatDate / gristDateToInputValue / inputValueToGristDate ----
// Grist Date columns are seconds-since-epoch, UTC midnight.
const epochSecondsFor2026_09_10 = Date.UTC(2026, 8, 10) / 1000;
eq(fn.gristDateToInputValue(epochSecondsFor2026_09_10), '2026-09-10', 'gristDateToInputValue: epoch seconds -> yyyy-mm-dd');
eq(fn.gristDateToInputValue(null), '', 'gristDateToInputValue: null -> empty');
eq(fn.gristDateToInputValue(''), '', 'gristDateToInputValue: empty -> empty');
eq(fn.inputValueToGristDate('2026-09-10'), epochSecondsFor2026_09_10, 'inputValueToGristDate: yyyy-mm-dd -> epoch seconds (round-trip)');
eq(fn.inputValueToGristDate(''), null, 'inputValueToGristDate: empty -> null');
eq(fn.inputValueToGristDate('not-a-date'), null, 'inputValueToGristDate: garbage -> null (no NaN leak)');
// Round-trip identity: date -> input value -> date must be stable (catches TZ bugs).
eq(fn.inputValueToGristDate(fn.gristDateToInputValue(epochSecondsFor2026_09_10)), epochSecondsFor2026_09_10, 'date round-trip is stable');

// ---- statusColor ----
eq(fn.statusColor('Prospection'), 'var(--status-prospection)', 'statusColor: Prospection');
eq(fn.statusColor('concrétisé'), 'var(--status-concretise)', 'statusColor: accented lowercase matches');
eq(fn.statusColor('Concretise'), 'var(--status-concretise)', 'statusColor: unaccented matches too');
eq(fn.statusColor('Un statut inconnu'), 'var(--status-default)', 'statusColor: unknown -> default');
eq(fn.statusColor(''), 'var(--status-default)', 'statusColor: empty -> default');

// ---- mapRecord / mapRecords ----
const mappings = { Nom: 'nom_grist', Structures: ['struct_a', 'struct_b'] };
const record = { id: 7, nom_grist: 'Orange', struct_a: 'A', struct_b: 'B', unrelated: 'x' };
eq(fn.mapRecord(record, mappings), { id: 7, Nom: 'Orange', Structures: ['A', 'B'] }, 'mapRecord: scalar + array-mapped roles');
eq(fn.mapRecord(null, mappings), null, 'mapRecord: null record -> null');
eq(fn.mapRecords([record], mappings), [{ id: 7, Nom: 'Orange', Structures: ['A', 'B'] }], 'mapRecords: maps over array');
eq(fn.mapRecords(null, mappings), [], 'mapRecords: null -> empty array (no crash)');

// ---- attachmentIdsFromValue ----
eq(fn.attachmentIdsFromValue(['L', 3, 5, 9]), [3, 5, 9], 'attachmentIdsFromValue: encoded list');
eq(fn.attachmentIdsFromValue(null), [], 'attachmentIdsFromValue: null -> empty');
eq(fn.attachmentIdsFromValue([1, 2]), [1, 2], 'attachmentIdsFromValue: bare array (defensive branch)');

// ---- guessDisplayColumn ----
eq(fn.guessDisplayColumn({ id: [1], manualSort: [1], Nom_Complet: ['x'], Email: ['y'] }), 'Nom_Complet', 'guessDisplayColumn: prefers Nom_Complet when present');
eq(fn.guessDisplayColumn({ id: [1], Sujet: ['x'] }), 'Sujet', 'guessDisplayColumn: falls through candidate list');
eq(fn.guessDisplayColumn({ id: [1], Zzz: ['x'] }), 'Zzz', 'guessDisplayColumn: falls back to first remaining column');

// ---- chipLabels ----
eq(fn.chipLabels(['Orange', { id: 4, label: 'Naval Group' }, null]), ['Orange', 'Naval Group', null], 'chipLabels: unwraps mixed string/object chips');
eq(fn.chipLabels(undefined), [], 'chipLabels: undefined -> empty array');

// ---- createFieldSaver: regression test for the shared-debounce-timer bug ----
// (editing field A then field B within the debounce window used to cancel
// field A's pending save entirely — this must never happen again).
async function testFieldSaverIndependence() {
  const updates = [];
  const mockGrist = {
    getTable: () => ({
      update: async ({ id, fields }) => { updates.push({ id, fields }); }
    })
  };
  const statuses = [];
  const sandbox2 = { console, window: {}, grist: mockGrist, setTimeout, clearTimeout };
  vm.createContext(sandbox2);
  vm.runInContext(src + '\nwindow.createFieldSaver = createFieldSaver;', sandbox2);
  const saveField = sandbox2.window.createFieldSaver((s) => statuses.push(s));

  saveField(1, 'colA', 'valueA');
  await new Promise(r => setTimeout(r, 50));
  saveField(1, 'colB', 'valueB'); // must NOT cancel colA's pending save

  await new Promise(r => setTimeout(r, 900));

  const gotA = updates.some(u => u.fields.colA === 'valueA');
  const gotB = updates.some(u => u.fields.colB === 'valueB');
  eq(gotA && gotB, true, 'createFieldSaver: editing field B does not cancel field A\'s pending save');
  eq(updates.length, 2, 'createFieldSaver: exactly one write per field (no dupes)');
}

async function testFieldSaverCollapsesSameField() {
  const updates = [];
  const mockGrist = { getTable: () => ({ update: async ({ fields }) => { updates.push(fields); } }) };
  const sandbox3 = { console, window: {}, grist: mockGrist, setTimeout, clearTimeout };
  vm.createContext(sandbox3);
  vm.runInContext(src + '\nwindow.createFieldSaver = createFieldSaver;', sandbox3);
  const saveField = sandbox3.window.createFieldSaver(() => {});

  saveField(1, 'colA', 'first');
  saveField(1, 'colA', 'second'); // same field, rapid re-edit: only the latest should be written
  await new Promise(r => setTimeout(r, 900));

  eq(updates.length, 1, 'createFieldSaver: rapid re-edit of the SAME field writes only once');
  eq(updates[0].colA, 'second', 'createFieldSaver: the write carries the latest value, not the first');
}

await testFieldSaverIndependence();
await testFieldSaverCollapsesSameField();

// ---- Cross-table helpers (crm.html reads/writes tables it isn't mapped on) ----
const x = (() => {
  const sb = { console, window: {}, document: undefined };
  vm.createContext(sb);
  vm.runInContext(src + '\nwindow.x = { normalizeKey, dataColumns, resolveColumns, recordsFromTableData, ' +
    'refIdsFromValue, recordLinksTo, daysSince, formatDaysSince, formatMontantCompact, stripHtml, excerpt, refColumnsTo };', sb);
  return sb.window.x;
})();

// normalizeKey
eq(x.normalizeKey('Téléphone'), 'telephone', 'normalizeKey strips accents');
eq(x.normalizeKey('Date de fin'), 'datedefin', 'normalizeKey strips spaces');
eq(x.normalizeKey('Nom_Complet'), 'nomcomplet', 'normalizeKey strips underscores and lowercases');
eq(x.normalizeKey(null), '', 'normalizeKey(null) -> empty');

// dataColumns
eq(x.dataColumns({ id: [1], manualSort: [1], Nom: ['a'] }), ['Nom'], 'dataColumns drops id and manualSort');

// resolveColumns
eq(x.resolveColumns(['Nom_Complet', 'Tel'], { NomComplet: ['Nom complet'], Telephone: ['Téléphone', 'Tel'] }),
  { NomComplet: 'Nom_Complet', Telephone: 'Tel' }, 'resolveColumns matches ignoring case/accents/separators');
eq(x.resolveColumns(['Date_interaction'], { Date: ['Date'] }), { Date: 'Date_interaction' },
  'resolveColumns falls back to a "contains" match');
eq(x.resolveColumns(['Objet'], { CR: ['CR', 'Compte_rendu'] }), { CR: null },
  'resolveColumns returns null for a role with no column (caller must skip it)');
eq(x.resolveColumns(['Prenom', 'Nom'], { Nom: ['Nom'] }), { Nom: 'Nom' },
  'resolveColumns prefers the exact match over a column merely containing it');

// recordsFromTableData
eq(x.recordsFromTableData({ id: [7, 8], Nom: ['a', 'b'], manualSort: [1, 2] }),
  [{ id: 7, Nom: 'a' }, { id: 8, Nom: 'b' }], 'recordsFromTableData transposes column-major data');
eq(x.recordsFromTableData({ id: [] }), [], 'recordsFromTableData on an empty table -> []');

// refIdsFromValue / recordLinksTo — raw Ref and RefList values from fetchTable
eq(x.refIdsFromValue(['L', 3, 5]), [3, 5], 'refIdsFromValue: RefList');
eq(x.refIdsFromValue(12), [12], 'refIdsFromValue: plain Ref');
eq(x.refIdsFromValue(0), [], 'refIdsFromValue: empty Ref (id 0) -> []');
eq(x.refIdsFromValue(null), [], 'refIdsFromValue: null -> []');
eq(x.refIdsFromValue(['L']), [], 'refIdsFromValue: empty RefList -> []');
eq(x.recordLinksTo({ P: ['L', 1, 2] }, 'P', 2), true, 'recordLinksTo: linked');
eq(x.recordLinksTo({ P: ['L', 1] }, 'P', 2), false, 'recordLinksTo: not linked');
eq(x.recordLinksTo({ P: ['L', 1] }, null, 1), false, 'recordLinksTo: unresolved column -> false');

// daysSince / formatDaysSince
const NOW = Date.UTC(2026, 8, 11) / 1000; // 2026-09-11
eq(x.daysSince(Date.UTC(2026, 8, 1) / 1000, NOW), 10, 'daysSince: 10 days ago');
eq(x.daysSince(Date.UTC(2026, 8, 11) / 1000, NOW), 0, 'daysSince: same day -> 0');
eq(x.daysSince(Date.UTC(2026, 8, 20) / 1000, NOW), -9, 'daysSince: future date -> negative');
eq(x.daysSince(null, NOW), null, 'daysSince: no date -> null');
eq(x.formatDaysSince(Date.UTC(2026, 5, 1) / 1000, NOW), '102 j', 'formatDaysSince: past');
eq(x.formatDaysSince(Date.UTC(2026, 8, 11) / 1000, NOW), "aujourd'hui", 'formatDaysSince: today');
eq(x.formatDaysSince(Date.UTC(2026, 8, 16) / 1000, NOW), 'dans 5 j', 'formatDaysSince: future');
eq(x.formatDaysSince(null, NOW), '', 'formatDaysSince: no date -> empty');

// formatMontantCompact
eq(x.formatMontantCompact(640000), '640 k€', 'formatMontantCompact: 640000 -> 640 k€');
eq(x.formatMontantCompact(1250000), '1,3 M€', 'formatMontantCompact: 1250000 -> 1,3 M€');
eq(x.formatMontantCompact(850), '850 €', 'formatMontantCompact: under 1k stays in euros');
eq(x.formatMontantCompact(null), '', 'formatMontantCompact: null -> empty');
eq(x.formatMontantCompact(0), '0 €', 'formatMontantCompact: 0 -> 0 €');

// refColumnsTo — toutes les colonnes qui pointent vers une table donnée
const META = [
  { id: 'Objet', type: 'Text', label: 'Objet' },
  { id: 'Partenaires', type: 'RefList:Structures', label: 'Partenaire(s)' },
  { id: 'LaboratoireCluster', type: 'RefList:Structures', label: 'Laboratoire Cluster' },
  { id: 'EtablissementCluster', type: 'Ref:Structures', label: 'Etablissement Cluster' },
  { id: 'ContactPartenaire', type: 'RefList:Contacts', label: 'Contact(s) partenaire' }
];
eq(x.refColumnsTo(META, 'Structures'), ['Partenaires', 'LaboratoireCluster', 'EtablissementCluster'],
  'refColumnsTo: Ref et RefList vers Structures, dans l\'ordre des colonnes');
eq(x.refColumnsTo(META, 'Contacts'), ['ContactPartenaire'], 'refColumnsTo: ne confond pas les tables cibles');
eq(x.refColumnsTo(META, 'Opportunites'), [], 'refColumnsTo: aucune colonne vers cette table -> []');
eq(x.refColumnsTo([], 'Structures'), [], 'refColumnsTo: métadonnées vides -> []');
eq(x.refColumnsTo(META, null), [], 'refColumnsTo: table cible inconnue -> [] (pas de faux positif)');

// stripHtml / excerpt
eq(x.stripHtml('<p>Bonjour <b>Marie</b></p><p>Suite</p>'), 'Bonjour Marie Suite', 'stripHtml: tags out, spacing kept');
eq(x.stripHtml('<script>alert(1)</script>Texte'), 'Texte', 'stripHtml: script content dropped');
eq(x.stripHtml('a &amp; b&nbsp;c'), 'a & b c', 'stripHtml: entities decoded');
eq(x.stripHtml(null), '', 'stripHtml: null -> empty');
eq(x.excerpt('<p>' + 'mot '.repeat(60) + '</p>', 20).endsWith('…'), true, 'excerpt: long text gets an ellipsis');
eq(x.excerpt('<p>court</p>', 20), 'court', 'excerpt: short text kept as-is');

console.log(`\n${pass} passed, ${fail} failed (final)`);
process.exit(fail ? 1 : 0);
