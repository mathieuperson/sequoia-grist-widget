// Helpers shared by the Sequoia CRM Grist widgets.

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Maps a "pilier_sequoia" value to its fixed color class (core/secu/env),
// used to render a <span class="value-pill ${pilierClass(v)}">.
function pilierClass(pilier) {
  if (!pilier) return '';
  const p = String(pilier).toLowerCase();
  if (p.includes('fondamentale') || p.includes('core')) return 'core';
  if (p.includes('sécurité') || p.includes('securite')) return 'secu';
  if (p.includes('environnement')) return 'env';
  return 'autre';
}

function initials(name) {
  if (!name) return '?';
  return String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Debounced per-field autosave. Each colId gets its own timer, so editing
// field A then field B within the debounce window saves BOTH instead of
// the second edit cancelling the first's pending save.
function createFieldSaver(statusSetter) {
  const timers = {};
  return function saveField(recordId, colId, value) {
    if (!colId) return;
    clearTimeout(timers[colId]);
    timers[colId] = setTimeout(async () => {
      try {
        if (statusSetter) statusSetter('Enregistrement…');
        await grist.getTable().update({ id: recordId, fields: { [colId]: value } });
        if (statusSetter) statusSetter('Enregistré ✓');
      } catch (err) {
        if (statusSetter) statusSetter('Erreur d’enregistrement');
        console.error(err);
      }
    }, 700);
  };
}

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Renders any Grist cell value (string, number, bool, list/reference) as
// a display-friendly string. Reference / reference-list cells usually
// arrive already resolved to their display value by grist.js, but this
// stays defensive in case a raw encoded value ever shows up.
function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    // Encoded Grist values look like ["L", ...] or ["R", rowId, tableId].
    if (value[0] === 'L') return value.slice(1).map(formatValue).filter(Boolean).join(', ');
    if (value[0] === 'R' || value[0] === 'r') return '';
    return value.map(formatValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return value.name || value.label || '';
  return String(value);
}

// Compact money, for KPI tiles where "640 k€" reads better than the full
// "640 000 €" (the exact figure stays available in the detail cards).
function formatMontantCompact(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  if (Math.abs(n) >= 1000000) return (Math.round(n / 100000) / 10).toLocaleString('fr-FR') + ' M€';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000).toLocaleString('fr-FR') + ' k€';
  return Math.round(n).toLocaleString('fr-FR') + ' €';
}

function formatMontant(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// Converts a Grist Date value (seconds since epoch, UTC midnight) to the
// yyyy-mm-dd string an <input type="date"> expects, and back.
function gristDateToInputValue(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inputValueToGristDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

// ---------- Couleur de statut d'opportunité ----------
// La vérité, c'est le document : Grist enregistre la couleur de chaque choix
// d'une colonne Choice dans ses widgetOptions
// (`choiceOptions[label] = {fillColor, textColor}`). Les widgets lisent ces
// couleurs et les utilisent telles quelles, pour qu'un statut ait la même
// couleur dans la table et dans chaque widget — et suive si on la change
// dans Grist, sans toucher au code.
//
// STATUS_FALLBACK ne sert donc que le temps de l'aller-retour REST, ou quand
// la colonne ne porte pas de couleurs. Il est calé sur la palette du
// document et pointe vers les tokens --status-* de common.css.
const STATUS_FALLBACK = {
  prospection:        { fill: 'var(--status-prospection)',        text: '#fff' },
  qualification:      { fill: 'var(--status-qualification)',      text: '#fff' },
  montage:            { fill: 'var(--status-montage)',            text: '#fff' },
  // Jaune vif : c'est le texte qui doit être sombre, pas l'inverse.
  contractualisation: { fill: 'var(--status-contractualisation)',  text: '#1c2321' },
  concretise:         { fill: 'var(--status-concretise)',         text: '#fff' },
  abandonne:          { fill: 'var(--status-abandonne)',          text: '#fff' }
};

// Couleurs lues dans le document, par statut normalisé.
const _statusStyles = {};

// Noir ou blanc selon la luminance du fond — utilisé quand le document donne
// une couleur de remplissage sans couleur de texte.
function readableTextOn(fill) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(fill || '').trim());
  if (!m) return '#fff';
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#1c2321' : '#fff';
}

// Enregistre les couleurs d'une colonne Choice telles que le document les
// porte. `styles` : { libellé: {fill, text} } — voir fetchChoiceStyles.
function registerStatusStyles(styles) {
  Object.keys(styles || {}).forEach(label => {
    const s = styles[label];
    if (!s || !s.fill) return;
    _statusStyles[normalizeKey(label)] = { fill: s.fill, text: s.text || readableTextOn(s.fill) };
  });
}

// Remplissage + couleur de texte d'un statut. Les couleurs du document
// gagnent ; sinon le repli ; sinon le gris neutre.
function statusStyle(status) {
  const key = normalizeKey(status);
  return _statusStyles[key] || STATUS_FALLBACK[key] || { fill: 'var(--status-default)', text: '#fff' };
}

function statusColor(status) {
  return statusStyle(status).fill;
}

// ---------- Avancement dans un pipeline ----------
// Un badge « Montage » ne dit pas si l'affaire commence ou s'achève : il faut
// connaître la liste pour le situer. Cette jauge le montre — autant de
// segments que d'étapes, remplis jusqu'à la courante, dans la couleur de
// l'étape. L'ordre vient des choix de la colonne du document (Grist les garde
// dans l'ordre où ils sont définis), donc aucune liste n'est figée ici.
//
// `stages` est la liste ordonnée des libellés, `current` celui de la ligne.
// Rend '' si l'étape est inconnue : mieux vaut pas de jauge qu'une fausse.
function statusProgressMarkup(current, stages, options) {
  const opts = Object.assign({ label: true, terminalKeys: ['abandonne'] }, options || {});
  const liste = (stages || []).filter(Boolean);
  const key = normalizeKey(current);
  const i = liste.findIndex(s => normalizeKey(s) === key);
  if (i < 0 || liste.length < 2) return '';
  const fill = statusColor(current);
  // Une étape d'abandon n'est pas un aboutissement : elle se marque à part,
  // barrée, plutôt qu'en jauge pleine qui se lirait comme un succès.
  const clos = opts.terminalKeys.some(k => key.includes(k));
  const segments = liste.map((s, j) => {
    const on = !clos && j <= i;
    return '<span class="sp-seg' + (on ? ' on' : '') + (clos && j === i ? ' clos' : '') +
      '" style="' + (on || (clos && j === i) ? 'background:' + fill + ';' : '') + '"></span>';
  }).join('');
  return '<span class="sp" role="img" aria-label="Étape ' + escapeHtml(current) +
    ' — ' + (i + 1) + ' sur ' + liste.length + '"' +
    ' title="' + escapeHtml(current) + ' — étape ' + (i + 1) + ' sur ' + liste.length + '">' +
    '<span class="sp-track">' + segments + '</span>' +
    (opts.label ? '<span class="sp-label">' + escapeHtml(current) + '</span>' : '') +
    '</span>';
}

// ---------- Répartition d'un tout ----------
// Une barre empilée : « 12 universités » ne dit pas si l'une en porte la
// moitié. Les parts sont rangées par taille décroissante et déclinées dans
// une seule teinte — la composition est ordonnée, pas catégorielle, donc la
// luminosité suffit à les séparer et aucune teinte n'est inventée. Au-delà
// de `top` parts, le reste est regroupé plutôt que dilué en tranches
// illisibles.
function stackMarkup(items, options) {
  const opts = Object.assign({ top: 4, resteLabel: 'autres', unit: '' }, options || {});
  const list = (items || [])
    .map(x => ({ label: String(x.label === undefined ? '' : x.label), value: Number(x.value) || 0 }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = list.reduce((n, x) => n + x.value, 0);
  if (!total || list.length < 2) return '';
  const tetes = list.slice(0, opts.top);
  const reste = list.slice(opts.top).reduce((n, x) => n + x.value, 0);
  const parts = reste > 0
    ? tetes.concat([{ label: (list.length - opts.top) + ' ' + opts.resteLabel, value: reste, reste: true }])
    : tetes;
  const segments = parts.map((x, i) => {
    // Une seule teinte, éclaircie par rang ; le regroupement final en retrait.
    const opacite = x.reste ? 0.22 : (1 - i * 0.17);
    return '<span class="st-seg" style="width:' + (x.value / total * 100) + '%;opacity:' + opacite +
      '" title="' + escapeHtml(x.label + ' — ' + x.value + (opts.unit ? ' ' + opts.unit : '') +
      ' (' + Math.round(x.value / total * 100) + ' %)') + '"></span>';
  }).join('');
  const tete = parts[0];
  return '<span class="st">' +
    '<span class="st-bar">' + segments + '</span>' +
    '<span class="st-legend">' + escapeHtml(tete.label) + ' ' +
      Math.round(tete.value / total * 100) + ' %</span>' +
    '</span>';
}

// Jauge d'une grandeur face à un seuil : « 187 j depuis le dernier contact »
// se lit mieux comme un remplissage qui a débordé que comme un nombre rouge.
// Au-delà du seuil la jauge est pleine et prend le ton d'alerte.
// `mode: 'part'` change le propos : ce n'est plus un seuil qu'on franchit
// mais une part d'un tout — « 5 sur 12 » — donc aucun dépassement à
// signaler, et le rouge reste réservé aux vraies alertes.
function meterMarkup(value, seuil, options) {
  const opts = Object.assign({ label: '', unit: '', mode: 'seuil' }, options || {});
  const v = Number(value);
  const s = Number(seuil) || 1;
  if (!isFinite(v)) return '';
  const part = Math.max(0, Math.min(1, v / s));
  const depasse = opts.mode !== 'part' && v >= s;
  return '<span class="mt' + (depasse ? ' over' : '') + '"' +
    ' title="' + escapeHtml(String(v) + (opts.unit ? ' ' + opts.unit : '')) +
    ' sur un seuil de ' + s + (opts.unit ? ' ' + opts.unit : '') + '">' +
    '<span class="mt-track"><span class="mt-fill" style="width:' +
      Math.round(part * 100) + '%"></span></span>' +
    (opts.label ? '<span class="mt-label">' + escapeHtml(opts.label) + '</span>' : '') +
    '</span>';
}

function statusTextColor(status) {
  return statusStyle(status).text;
}

// Choix d'une colonne Choice avec leurs couleurs, depuis le document :
// { choices: [...], styles: { libellé: {fill, text} } }. `choices` garde
// l'ordre configuré dans Grist.
async function fetchChoiceStyles(tableId, colId) {
  const empty = { choices: [], styles: {} };
  if (!tableId || !colId) return empty;
  try {
    const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
    const res = await fetch(`${baseUrl}/tables/${encodeURIComponent(tableId)}/columns?auth=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const col = ((await res.json()).columns || []).find(c => c.id === colId);
    let opts = col && col.fields && col.fields.widgetOptions;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (err) { opts = null; } }
    return choiceStylesFromWidgetOptions(opts);
  } catch (err) {
    console.error('fetchChoiceStyles failed for', tableId, colId, err);
    return empty;
  }
}

// Partie pure de fetchChoiceStyles, pour être testable sans Grist.
function choiceStylesFromWidgetOptions(opts) {
  const choices = (opts && Array.isArray(opts.choices)) ? opts.choices.filter(Boolean).map(String) : [];
  const raw = (opts && opts.choiceOptions) || {};
  const styles = {};
  choices.forEach(label => {
    const o = raw[label];
    if (!o || !o.fillColor) return;
    styles[label] = { fill: o.fillColor, text: o.textColor || readableTextOn(o.fillColor) };
  });
  return { choices, styles };
}

function formatDate(value) {
  if (!value) return '';
  // Grist Date/DateTime columns come through as seconds-since-epoch.
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Whole days between a Grist date and `now` (default: today). Positive =
// in the past ("dernier contact il y a 12 j"), negative = in the future
// ("échéance dans 5 j"). Returns null when there's no usable date.
function daysSince(value, now) {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (isNaN(d.getTime())) return null;
  const ref = now === undefined ? new Date() : (typeof now === 'number' ? new Date(now * 1000) : new Date(now));
  const DAY = 86400000;
  // Compare calendar days, not exact instants: a meeting logged this morning
  // must read "aujourd'hui", not "0,3 j".
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  return Math.round((b - a) / DAY);
}

function formatDaysSince(value, now) {
  const n = daysSince(value, now);
  if (n === null) return '';
  if (n === 0) return "aujourd'hui";
  if (n < 0) return 'dans ' + (-n) + ' j';
  return n + ' j';
}

// Turns a mapped-columns "record" (raw colIds) into an object keyed by
// the widget's role names, using the `mappings` grist.onRecord hands back.
function mapRecord(record, mappings) {
  if (!record) return null;
  const out = { id: record.id };
  if (!mappings) return record;
  for (const role in mappings) {
    const colId = mappings[role];
    if (Array.isArray(colId)) {
      out[role] = colId.map(c => record[c]);
    } else if (colId) {
      out[role] = record[colId];
    } else {
      out[role] = undefined;
    }
  }
  return out;
}

function mapRecords(records, mappings) {
  return (records || []).map(r => mapRecord(r, mappings));
}

// ---------- Attachments (upload / download via the Grist REST API) ----------
// Attachments column raw value is ["L", id1, id2, ...]. `docApi.getAccessToken`
// gives a short-lived token + baseUrl (".../api/docs/<docId>") used to talk
// to the REST API directly (uploads, downloads, metadata).

function attachmentIdsFromValue(value) {
  if (Array.isArray(value) && value[0] === 'L') return value.slice(1);
  if (Array.isArray(value)) return value;
  return [];
}

// Envoie des fichiers dans le magasin de pièces jointes du document, et rend
// leurs identifiants — ce qu'attend une colonne de type Attachments.
//
// Deux chemins, dans cet ordre : l'API du widget quand la version de Grist la
// porte (elle passe par le même canal que les autres écritures, donc sans
// jeton ni requête traversant l'iframe), puis l'API REST du document. Le
// second échouait en silence sur certaines instances — le jeton d'accès d'un
// widget peut être refusé en écriture sur /attachments — et l'appelant n'avait
// qu'un « (403) » à afficher. On remonte désormais ce que le serveur a dit.
async function uploadAttachments(files) {
  const liste = Array.from(files || []).filter(Boolean);
  if (!liste.length) return [];

  if (grist.docApi && typeof grist.docApi.uploadAttachment === 'function') {
    const ids = [];
    for (const fichier of liste) {
      ids.push(await grist.docApi.uploadAttachment(fichier));
    }
    return ids.filter(id => id !== null && id !== undefined);
  }

  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: false });
  const form = new FormData();
  liste.forEach(fichier => form.append('upload', fichier, fichier.name));
  let res;
  try {
    res = await fetch(`${baseUrl}/attachments?auth=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: form
    });
  } catch (err) {
    // « Failed to fetch » ne dit rien : Grist répond toujours avec les en-têtes
    // CORS, donc la réponse a été coupée avant lui (proxy, taille maximale
    // d'envoi, pare-feu). Une lecture sur la même adresse départage « l'API
    // est inaccessible au widget » de « seul l'envoi de fichier est bloqué ».
    const taille = liste.reduce((t, f) => t + (f.size || 0), 0);
    let lectureOk = false;
    try {
      const probe = await fetch(`${baseUrl}/attachments?auth=${encodeURIComponent(token)}`);
      lectureOk = probe.ok;
    } catch (e) { /* lecture bloquée aussi */ }
    const cause = lectureOk
      ? 'le serveur lit bien le document, mais refuse l’envoi de fichiers depuis le widget'
      : 'le widget ne parvient pas à joindre l’API du document';
    throw new Error('Le document n’a pas pu être joint : ' + cause +
      ' (' + formatTaille(taille) + ', ' + (err && err.message ? err.message : err) + ')');
  }
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    throw new Error('Envoi refusé par le document — HTTP ' + res.status +
      (corps ? ' : ' + corps.slice(0, 200) : ''));
  }
  const data = await res.json();
  // Response shape: array of ids, or array of {id} objects depending on version.
  const ids = (Array.isArray(data) ? data : data.rows || [])
    .map(x => (typeof x === 'object' ? x.id : x))
    .filter(id => id !== null && id !== undefined);
  if (!ids.length) throw new Error('Le document n’a renvoyé aucun identifiant de pièce jointe');
  return ids;
}

function formatTaille(octets) {
  if (octets < 1024) return octets + ' o';
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
  return (octets / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
}

async function getAttachmentMeta(id) {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
  const res = await fetch(`${baseUrl}/attachments/${id}?auth=${encodeURIComponent(token)}`);
  if (!res.ok) return { id, fileName: `Fichier #${id}` };
  const data = await res.json();
  const fields = data.fields || data;
  return { id, fileName: fields.fileName || `Fichier #${id}`, fileSize: fields.fileSize };
}

// Reads a column's real Grist-defined Choice/Choice-List options (the list
// configured in "Modifier les choix", not just the values currently used by
// loaded records) via the REST API's /tables/{tableId}/columns endpoint,
// which exposes each column's `type` and `widgetOptions` (a JSON string
// holding `choices` for Choice columns). Returns null for non-Choice
// columns or on any failure, so callers can fall back to a plain input.
const _choicesCache = {};
async function fetchColumnChoices(tableId, colId) {
  if (!colId) return null;
  const cacheKey = tableId + '::' + colId;
  if (cacheKey in _choicesCache) return _choicesCache[cacheKey];
  try {
    const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
    const res = await fetch(`${baseUrl}/tables/${encodeURIComponent(tableId)}/columns?auth=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const col = (data.columns || []).find(c => c.id === colId);
    const type = col && col.fields && col.fields.type;
    if (!type || type.indexOf('Choice') !== 0) { _choicesCache[cacheKey] = null; return null; }
    let opts = col.fields.widgetOptions;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }
    const choices = (opts && Array.isArray(opts.choices)) ? opts.choices : null;
    _choicesCache[cacheKey] = choices;
    return choices;
  } catch (err) {
    console.error('fetchColumnChoices failed for', tableId, colId, err);
    _choicesCache[cacheKey] = null;
    return null;
  }
}

// Column metadata (id, type, label, isFormula) of a table, from the REST
// /columns endpoint. A reference column's type carries its target table:
// "Ref:Structures", "RefList:Contacts". isFormula distinguishes a computed
// lookup (legitimate for display/matching, never writable) from a real data
// column a picker could save to. Returns [] on any failure so callers fall
// back to whatever they know statically.
const _colMetaCache = {};
async function fetchColumnMeta(tableId) {
  if (tableId in _colMetaCache) return _colMetaCache[tableId];
  try {
    const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
    const res = await fetch(`${baseUrl}/tables/${encodeURIComponent(tableId)}/columns?auth=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cols = (data.columns || []).map(c => {
      let wo = c.fields && c.fields.widgetOptions;
      if (typeof wo === 'string') { try { wo = JSON.parse(wo); } catch (err) { wo = null; } }
      return {
        id: c.id,
        type: (c.fields && c.fields.type) || '',
        label: (c.fields && c.fields.label) || c.id,
        isFormula: !!(c.fields && c.fields.isFormula),
        // Les choix d'une colonne Choice / ChoiceList, dans l'ordre du document :
        // de quoi proposer une liste dans un formulaire d'édition.
        choices: (wo && Array.isArray(wo.choices)) ? wo.choices.filter(Boolean).map(String) : []
      };
    });
    _colMetaCache[tableId] = cols;
    return cols;
  } catch (err) {
    console.error('fetchColumnMeta failed for', tableId, err);
    _colMetaCache[tableId] = [];
    return [];
  }
}

// Every column of a table that points at `targetTableId`. A CRM row can be
// attached to a structure through more than one column (Partenaire(s), but
// also Etablissement / Laboratoire / Equipe Cluster), and a fiche that only
// looked at one of them would hide real history.
function refColumnsTo(columnMeta, targetTableId) {
  if (!targetTableId) return [];
  return (columnMeta || [])
    .filter(c => c.type === 'Ref:' + targetTableId || c.type === 'RefList:' + targetTableId)
    .map(c => c.id);
}

async function getAttachmentDownloadUrl(id) {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
  return `${baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token)}`;
}

// ---------- Reference / Reference-List picker (add/remove existing rows) ----------
// Reads another table via docApi.fetchTable (requires 'full' access) to
// offer autocomplete suggestions, and writes back with parseStrings:true
// so Grist resolves the typed/picked display text to the matching row(s)
// in the target table.

const _tableCache = {};
function fetchTableCached(tableId) {
  if (!_tableCache[tableId]) {
    _tableCache[tableId] = grist.docApi.fetchTable(tableId).catch(err => {
      delete _tableCache[tableId];
      throw err;
    });
  }
  return _tableCache[tableId];
}

// fetchTable results are cached for the life of the page; drop an entry
// after writing to that table so the next read sees the new rows.
function invalidateTableCache(tableId) {
  if (tableId === undefined) {
    Object.keys(_tableCache).forEach(k => delete _tableCache[k]);
  } else {
    delete _tableCache[tableId];
  }
}

const DISPLAY_COL_CANDIDATES = ['Nom_Complet', 'NomComplet', 'nom_acteur', 'Nom', 'nom', 'Sujet', 'Objet', 'Name', 'Title', 'name'];

function guessDisplayColumn(tableData) {
  const cols = Object.keys(tableData).filter(k => k !== 'id' && k !== 'manualSort');
  for (const candidate of DISPLAY_COL_CANDIDATES) {
    if (cols.includes(candidate)) return candidate;
  }
  return cols[0] || 'id';
}

async function fetchReferenceOptions(tableId) {
  const data = await fetchTableCached(tableId);
  const col = guessDisplayColumn(data);
  const ids = data.id || [];
  const labels = data[col] || [];
  return ids
    .map((rowId, i) => ({ id: rowId, label: String(labels[i] ?? ('#' + rowId)) }))
    .filter(o => o.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

function findColumnByCandidates(tableData, candidates) {
  const cols = Object.keys(tableData).filter(k => k !== 'id' && k !== 'manualSort');
  const lower = candidates.map(c => c.toLowerCase());
  return cols.find(c => lower.includes(c.toLowerCase())) ||
    cols.find(c => lower.some(lc => c.toLowerCase().includes(lc))) ||
    null;
}

// Best-effort: narrows `tableId`'s options down to rows whose own reference
// column (guessed among `linkCandidates`) points to one of `parentLabels`
// (resolved to row ids via `parentTableId`'s display column). Falls back to
// the unfiltered option list whenever a step of the guess comes up empty,
// so a wrong guess never hides genuinely valid choices.
async function fetchReferenceOptionsFilteredBy(tableId, linkCandidates, parentTableId, parentLabels) {
  const allOptions = await fetchReferenceOptions(tableId);
  if (!parentLabels || parentLabels.length === 0) return allOptions;

  try {
    const parentData = await fetchTableCached(parentTableId);
    const parentDisplayCol = guessDisplayColumn(parentData);
    const parentIds = parentLabels
      .map(label => {
        const idx = (parentData[parentDisplayCol] || []).indexOf(label);
        return idx >= 0 ? parentData.id[idx] : null;
      })
      .filter(id => id !== null);
    if (parentIds.length === 0) return allOptions;

    const data = await fetchTableCached(tableId);
    const linkCol = findColumnByCandidates(data, linkCandidates);
    if (!linkCol) return allOptions;

    const ids = data.id || [];
    const linkValues = data[linkCol] || [];
    const matchingIds = new Set();
    ids.forEach((rowId, i) => {
      const v = linkValues[i];
      const refIds = Array.isArray(v) ? v.filter(x => typeof x === 'number') : (typeof v === 'number' ? [v] : []);
      if (refIds.some(id => parentIds.includes(id))) matchingIds.add(rowId);
    });

    const filtered = allOptions.filter(o => matchingIds.has(o.id));
    return filtered.length > 0 ? filtered : allOptions;
  } catch (err) {
    console.error('fetchReferenceOptionsFilteredBy failed for', tableId, err);
    return allOptions;
  }
}

// Renders an add/remove chip picker with autocomplete into `container`.
// `currentLabels` is the initial list of display strings already linked
// (these come straight from Grist's own resolved record, so they're kept
// as-is — no need to re-resolve them to an id to round-trip correctly).
// `onChange(chips)` is called with the full updated chip list — each chip
// is `{id, label}` when picked from a suggestion (real row id, always
// resolves correctly) or a plain string for a pre-existing/untouched
// entry — on every add/remove. Optional `filterConfig` =
// { linkCandidates, parentTableId, parentLabels } narrows the suggestions
// to rows linked to the given parent (best-effort).
async function renderRefPicker(container, currentLabels, targetTableId, onChange, filterConfig) {
  const datalistId = 'dl-' + Math.random().toString(36).slice(2);
  let chips = (currentLabels || []).filter(Boolean); // strings (pre-existing) or {id,label} (added this session)
  let options = [];

  function chipLabel(c) { return (c && typeof c === 'object') ? c.label : c; }

  function paint() {
    container.innerHTML =
      '<div class="ref-chips">' +
        chips.map((c, i) =>
          '<span class="ref-chip">' + escapeHtml(chipLabel(c)) +
          '<button type="button" data-i="' + i + '" title="Retirer">✕</button></span>'
        ).join('') +
      '</div>' +
      '<input class="editable-input ref-input" list="' + datalistId + '" placeholder="Rechercher et ajouter… (Entrée)">' +
      '<datalist id="' + datalistId + '">' +
        options.map(o => '<option value="' + escapeHtml(o.label) + '">').join('') +
      '</datalist>';

    container.querySelectorAll('.ref-chip button').forEach(btn => {
      btn.addEventListener('click', () => {
        chips.splice(Number(btn.dataset.i), 1);
        paint();
        onChange([...chips]);
      });
    });

    const input = container.querySelector('.ref-input');
    function tryAdd() {
      const val = input.value.trim();
      if (!val) return;
      if (chips.some(c => chipLabel(c).toLowerCase() === val.toLowerCase())) { input.value = ''; return; }

      // Only add rows that actually exist in the target table (matched by
      // suggestion), so we always write a real row id — never a typed
      // string Grist might fail to resolve (that's what caused
      // "InvalidTypedValue" before).
      const match = options.find(o => o.label.toLowerCase() === val.toLowerCase());
      if (!match) {
        input.classList.add('ref-input-error');
        setTimeout(() => input.classList.remove('ref-input-error'), 900);
        return;
      }
      chips.push({ id: match.id, label: match.label });
      input.value = '';
      paint();
      onChange([...chips]);
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });
    input.addEventListener('change', tryAdd); // fires when picking a datalist suggestion
  }

  paint();

  try {
    options = filterConfig
      ? await fetchReferenceOptionsFilteredBy(targetTableId, filterConfig.linkCandidates, filterConfig.parentTableId, filterConfig.parentLabels)
      : await fetchReferenceOptions(targetTableId);
    paint();
  } catch (err) {
    console.error('fetchReferenceOptions failed for', targetTableId, err);
  }
}

// A picker's onChange hands back "chips" that may mix plain label strings
// (pre-existing) and {id,label} objects (added this session) — use this
// wherever only the display text is needed (e.g. as another picker's
// filterConfig.parentLabels).
function chipLabels(chips) {
  return (chips || []).map(c => (c && typeof c === 'object') ? c.label : c);
}

// ---------- Working across several tables from one widget ----------
// A widget is mapped onto a single table, so `grist.getTable()` only ever
// reaches that one. Everything else (reading a related table, writing to
// it) goes through docApi: fetchTable to read, applyUserActions to write.
// Column ids of those other tables aren't part of the widget's column
// mapping either, so they're resolved from the data's own keys by name.

function normalizeKey(str) {
  return String(str === null || str === undefined ? '' : str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // "Téléphone" -> "Telephone"
    .toLowerCase().replace(/[^a-z0-9]/g, '');          // "Date de fin" -> "datedefin"
}

// Column ids actually holding data in a fetchTable result.
function dataColumns(tableData) {
  return Object.keys(tableData || {}).filter(k => k !== 'id' && k !== 'manualSort');
}

// Maps role names to this document's real column ids, e.g.
// resolveColumns(['Nom_Complet','Tel'], {NomComplet:['Nom complet'], Telephone:['Téléphone']})
// -> {NomComplet:'Nom_Complet', Telephone:'Tel'}. Exact (accent/case/
// separator-insensitive) match first, then a contains match, so a document
// that named a column "Date_interaction" still resolves the "Date" role.
// A role with no match resolves to null — callers must skip it rather than
// write to an undefined column.
function resolveColumns(colIds, roleCandidates) {
  const cols = colIds || [];
  const index = {};
  cols.forEach(c => { const k = normalizeKey(c); if (!(k in index)) index[k] = c; });

  const out = {};
  for (const role in roleCandidates) {
    const candidates = roleCandidates[role];
    let found = null;
    for (const cand of candidates) {
      const hit = index[normalizeKey(cand)];
      if (hit) { found = hit; break; }
    }
    if (!found) {
      for (const cand of candidates) {
        const nc = normalizeKey(cand);
        if (nc.length < 4) continue; // a 2-3 letter candidate would match almost anything
        const hit = cols.find(c => normalizeKey(c).includes(nc));
        if (hit) { found = hit; break; }
      }
    }
    out[role] = found || null;
  }
  return out;
}

// fetchTable hands back column-major data ({id:[1,2], Nom:['a','b']});
// turn it into the row objects the rest of the code works with.
function recordsFromTableData(tableData) {
  const ids = (tableData && tableData.id) || [];
  const cols = dataColumns(tableData);
  return ids.map((id, i) => {
    const rec = { id };
    cols.forEach(c => { rec[c] = tableData[c][i]; });
    return rec;
  });
}

// Row ids referenced by a raw Ref (a number) or RefList (["L", 1, 2]) cell.
// Raw values are what fetchTable returns — unlike onRecords, which resolves
// references to their display text.
function refIdsFromValue(value) {
  if (typeof value === 'number') return value ? [value] : [];
  if (Array.isArray(value)) {
    if (value[0] === 'L') return value.slice(1).filter(v => typeof v === 'number');
    if (value[0] === 'R' || value[0] === 'r') return typeof value[1] === 'number' ? [value[1]] : [];
    return value.filter(v => typeof v === 'number');
  }
  return [];
}

function recordLinksTo(record, colId, rowId) {
  if (!colId) return false;
  return refIdsFromValue(record[colId]).includes(rowId);
}

// ---------- Writing to any table (not just the mapped one) ----------

async function addRecord(tableId, fields) {
  const res = await grist.docApi.applyUserActions([['AddRecord', tableId, null, fields]]);
  invalidateTableCache(tableId);
  return res && res.retValues ? res.retValues[0] : null;
}

async function updateRecord(tableId, rowId, fields) {
  await grist.docApi.applyUserActions([['UpdateRecord', tableId, rowId, fields]]);
  invalidateTableCache(tableId);
}

// La valeur à écrire dans une colonne qui peut porter une liste ou une seule
// valeur — référence comme choix. Grist attend ['L', …] pour une RefList ou
// une ChoiceList et la valeur nue pour une Ref ou une Choice ; il refuse
// l'autre forme, et la cellule s'affiche alors en rose dans la table. Écrire
// « au petit bonheur » produit donc des lignes que le document rejette, sans
// que le widget s'en aperçoive : `rel.listCols` porte les colonnes de type
// liste, relevées dans les métadonnées à la résolution de la table.
function isListCol(rel, colId) {
  return !!colId && ((rel && rel.listCols) || []).includes(colId);
}

function colValue(rel, colId, valeurs) {
  return isListCol(rel, colId) ? ['L', ...valeurs] : valeurs[0];
}

async function removeRecord(tableId, rowId) {
  await grist.docApi.applyUserActions([['RemoveRecord', tableId, rowId]]);
  invalidateTableCache(tableId);
}

// Same per-column debounced autosave as createFieldSaver, but against an
// arbitrary table — one timer per column so editing two fields quickly
// saves both. `onSaved` lets the caller refresh its view afterwards.
function createRecordSaver(statusSetter, onSaved) {
  const timers = {};
  return function saveField(tableId, rowId, colId, value) {
    if (!tableId || !colId || !rowId) return;
    const key = tableId + '::' + rowId + '::' + colId;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(async () => {
      try {
        if (statusSetter) statusSetter('Enregistrement…');
        await updateRecord(tableId, rowId, { [colId]: value });
        if (statusSetter) statusSetter('Enregistré ✓');
        if (onSaved) onSaved();
      } catch (err) {
        if (statusSetter) statusSetter('Erreur d’enregistrement');
        console.error(err);
      }
    }, 700);
  };
}

// ---------- Compte-rendu (rich text stored as sanitized HTML) ----------
// Images keep a stable data-att-id reference instead of a live download URL
// (those carry a short-lived auth token): resolved to a real src only for
// display, stripped back to the stable form before saving.

function looksLikeHtml(text) {
  return /<[a-z][\s\S]*>/i.test(text || '');
}

function normalizeCrToHtml(raw) {
  if (!raw) return '';
  // Legacy compte-rendus were stored as plain Markdown; current ones are HTML.
  const html = looksLikeHtml(raw) ? raw : (typeof marked !== 'undefined' ? marked.parse(raw) : escapeHtml(raw));
  const clean = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html, { ADD_ATTR: ['data-att-id'] }) : html;
  const tmp = document.createElement('div');
  tmp.innerHTML = clean;
  tmp.querySelectorAll('img[src^="grist-att:"]').forEach(img => {
    img.setAttribute('data-att-id', img.getAttribute('src').replace('grist-att:', ''));
    img.removeAttribute('src');
  });
  return tmp.innerHTML;
}

function serializeCrForSave(container) {
  const tmp = document.createElement('div');
  tmp.innerHTML = container.innerHTML;
  tmp.querySelectorAll('img[data-att-id]').forEach(img => img.removeAttribute('src'));
  return typeof DOMPurify !== 'undefined'
    ? DOMPurify.sanitize(tmp.innerHTML, { ADD_ATTR: ['data-att-id'] })
    : tmp.innerHTML;
}

async function resolveImagesIn(container) {
  const imgs = container.querySelectorAll('img[data-att-id]');
  for (const img of imgs) {
    try {
      img.src = await getAttachmentDownloadUrl(img.getAttribute('data-att-id'));
    } catch (err) {
      img.alt = 'Image indisponible';
    }
  }
}

// Plain-text excerpt of a compte-rendu, for timeline previews. Regex-based
// rather than DOM-based so it stays a pure function (and stays usable on a
// list of 200 interactions without building 200 throwaway elements).
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(text, maxLength) {
  const t = stripHtml(text);
  const max = maxLength || 160;
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

async function saveRefField(recordId, colId, chips, statusEl) {
  if (!colId) return;
  try {
    if (statusEl) statusEl.textContent = 'Enregistrement…';
    // A chip picked from a suggestion carries its real row id (always
    // resolves correctly); a pre-existing/untouched chip is still the
    // plain label Grist itself resolved it to, which round-trips fine via
    // parseStrings since it's the same resolution Grist already vouched for.
    const values = (chips || []).map(c => (c && typeof c === 'object' && c.id != null) ? c.id : c);
    await grist.getTable().update(
      { id: recordId, fields: { [colId]: ['L', ...values] } },
      { parseStrings: true }
    );
    if (statusEl) statusEl.textContent = 'Enregistré ✓';
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Erreur d’enregistrement';
    console.error(err);
  }
}

// ---------- Filtre à cases à cocher (menu déroulant) ----------
// Un bouton qui annonce le nombre de valeurs retenues, un panneau avec
// recherche, « tout cocher / décocher » et une case par valeur. Les styles
// (.ms-*) vivent dans common.css.

// Markup d'un filtre, à insérer là où on veut le poser.
function msFilterMarkup(id, label, labelAll) {
  return '<div class="ms-filter" id="' + escapeHtml(id) + '">' +
    '<button class="ms-filter-btn" type="button">' +
      '<span class="ms-label">' + escapeHtml(label) + '</span> ' +
      '<span class="ms-count">' + escapeHtml(labelAll || 'Tous') + '</span>' +
    '</button>' +
    '<div class="ms-filter-panel" hidden>' +
      '<input class="ms-search" type="search" placeholder="Rechercher…" aria-label="Rechercher dans ' + escapeHtml(label) + '">' +
      '<div class="ms-quick-actions">' +
        '<button type="button" data-action="all">Tout cocher</button>' +
        '<button type="button" data-action="none">Tout décocher</button>' +
      '</div>' +
      '<div class="ms-options"></div>' +
    '</div>' +
  '</div>';
}

// Branche le comportement sur ce markup. `onChange(selection)` est appelé à
// chaque changement. Rend { setOptions, getSelected, setSelected, close }.
function createMultiSelect(root, conf) {
  // `single` : une seule valeur à la fois. Utile quand la colonne visée est un
  // Choice simple et non une ChoiceList — proposer d'en cocher trois pour n'en
  // écrire qu'une ferait mentir le formulaire.
  const opts = Object.assign(
    { values: [], selected: [], labelAll: 'Tous', onChange: null, single: false }, conf || {});
  if (!root) return { setOptions() {}, getSelected: () => [], setSelected() {}, close() {} };
  let values = opts.values.slice();
  let selected = opts.single ? opts.selected.slice(0, 1) : opts.selected.slice();

  const btn = root.querySelector('.ms-filter-btn');
  const countEl = btn.querySelector('.ms-count');
  const panel = root.querySelector('.ms-filter-panel');
  const search = root.querySelector('.ms-search');
  const optionsEl = root.querySelector('.ms-options');

  function updateButton() {
    const n = selected.length;
    countEl.textContent = n === 0 ? opts.labelAll
      : (opts.single ? selected[0] : n + ' sélectionné' + (n > 1 ? 's' : ''));
    btn.classList.toggle('active', n > 0);
  }

  // Les valeurs retenues passent devant : sur une liste de deux cents
  // structures, ce qu'on a déjà coché est introuvable au milieu de l'ordre
  // alphabétique. L'ordre n'est recalculé qu'à l'ouverture du panneau, pas à
  // chaque clic — une case qui sauterait sous le curseur ferait décocher de
  // travers. Chaque groupe garde l'ordre reçu.
  function orderedValues() {
    const retenues = values.filter(v => selected.includes(v));
    const reste = values.filter(v => !selected.includes(v));
    return retenues.concat(reste);
  }

  function renderOptions() {
    const ordre = orderedValues();
    const coupure = selected.filter(v => values.includes(v)).length;
    optionsEl.innerHTML = values.length
      ? ordre.map((v, i) =>
          '<label class="ms-option' + (i === coupure && coupure ? ' ms-first-unselected' : '') +
          '"><input type="checkbox" value="' + escapeHtml(v) + '"' +
          (selected.includes(v) ? ' checked' : '') + '> ' + escapeHtml(v) + '</label>').join('')
      : '<div class="ms-empty">Aucune valeur</div>';
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (opts.single) {
          selected = cb.checked ? [cb.value] : [];
          // Les autres cases doivent suivre, sans re-trier sous le curseur.
          optionsEl.querySelectorAll('input[type="checkbox"]').forEach(autre => {
            if (autre !== cb) autre.checked = false;
          });
        } else {
          const set = new Set(selected);
          if (cb.checked) set.add(cb.value); else set.delete(cb.value);
          selected = Array.from(set);
        }
        updateButton();
        if (opts.onChange) opts.onChange(selected.slice());
      });
    });
  }

  function filterOptionRows(q) {
    optionsEl.querySelectorAll('.ms-option').forEach(l => {
      l.hidden = !!q && !l.textContent.toLowerCase().includes(q);
    });
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = panel.hidden;
    // Un seul panneau ouvert à la fois, y compris entre filtres voisins.
    document.querySelectorAll('.ms-filter-panel').forEach(p => { p.hidden = true; });
    panel.hidden = !willOpen;
    // À l'ouverture : remonter ce qui est retenu, et repartir sans filtre.
    if (willOpen) { renderOptions(); search.value = ''; filterOptionRows(''); search.focus(); }
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', () => filterOptionRows(search.value.trim().toLowerCase()));

  // "Tout cocher" ne porte que sur les valeurs visibles : combiné à la
  // recherche, c'est ce qui permet de cocher un sous-ensemble d'un coup.
  const boutonTout = root.querySelector('[data-action="all"]');
  if (opts.single) {
    boutonTout.hidden = true; // « Tout cocher » n'a pas de sens pour une valeur unique
  } else {
    boutonTout.addEventListener('click', () => {
      const visible = Array.from(optionsEl.querySelectorAll('.ms-option'))
        .filter(l => !l.hidden).map(l => l.querySelector('input').value);
      selected = Array.from(new Set(selected.concat(visible)));
      renderOptions(); updateButton();
      if (opts.onChange) opts.onChange(selected.slice());
    });
  }
  root.querySelector('[data-action="none"]').addEventListener('click', () => {
    selected = [];
    renderOptions(); updateButton();
    if (opts.onChange) opts.onChange(selected.slice());
  });

  renderOptions();
  updateButton();

  return {
    // Les valeurs disponibles changent avec les données : une sélection qui
    // n'existe plus est abandonnée, sinon elle filtrerait tout en silence.
    setOptions(newValues) {
      values = (newValues || []).slice();
      const kept = selected.filter(v => values.includes(v));
      const dropped = kept.length !== selected.length;
      selected = kept;
      renderOptions(); updateButton();
      if (dropped && opts.onChange) opts.onChange(selected.slice());
    },
    getSelected() { return selected.slice(); },
    setSelected(next) {
      selected = (next || []).filter(v => values.includes(v));
      if (opts.single) selected = selected.slice(0, 1);
      renderOptions(); updateButton();
    },
    close() { panel.hidden = true; }
  };
}

// ---------- Journal (colonne Commentaire des opportunités) ----------
//
// Une entrée par ligne, datée entre crochets : « [2026-09-25] Relance envoyée ».
// Pas de table à créer, et le texte reste lisible tel quel dans Grist. Ce qui ne
// suit pas ce format (écrit à la main) est gardé comme une entrée sans date ; les
// lignes qui suivent une entrée datée la prolongent.
const MARQUE_JOURNAL = /^\s*\[(\d{4}-\d{2}-\d{2})\]\s?/;

function jourIso(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

// Rend [{ date, texte, ligne }] — `ligne` est l'index de la première ligne de
// l'entrée dans le texte, de quoi la dater après coup.
function lireJournal(texte) {
  const lignes = String(texte || '').split('\n');
  const entrees = [];
  lignes.forEach((ligne, i) => {
    const m = MARQUE_JOURNAL.exec(ligne);
    if (m) entrees.push({ date: m[1], texte: ligne.replace(MARQUE_JOURNAL, '').trim(), ligne: i });
    else if (ligne.trim() && entrees.length && entrees[entrees.length - 1].date) entrees[entrees.length - 1].texte += '\n' + ligne.trim();
    else if (ligne.trim()) entrees.push({ date: null, texte: ligne.trim(), ligne: i });
  });
  return entrees;
}

function ecrireJournal(texteExistant, nouvelleEntree, jour) {
  const ligne = '[' + (jour || jourIso()) + '] ' + String(nouvelleEntree).trim();
  const avant = String(texteExistant || '').trim();
  // La plus récente en tête : c'est ce qu'on vient chercher.
  return avant ? ligne + '\n' + avant : ligne;
}

// Date une entrée qui n'en avait pas (index de ligne rendu par lireJournal).
function daterEntreeJournal(texte, ligne, jour) {
  const lignes = String(texte || '').split('\n');
  if (ligne < 0 || ligne >= lignes.length || MARQUE_JOURNAL.test(lignes[ligne])) return String(texte || '');
  lignes[ligne] = '[' + jour + '] ' + lignes[ligne].trim();
  return lignes.join('\n');
}

// Un commentaire modifié à la main (formulaire, cellule) : les lignes nouvelles
// qui ne portent pas de date prennent celle du jour. Les lignes déjà présentes
// restent telles quelles, datées ou non. Sert aux formulaires qui écrivent la
// colonne Commentaire sans passer par « Noter ».
function daterNouvellesLignes(ancien, nouveau, jour) {
  const avant = new Set(String(ancien || '').split('\n').map(l => l.trim()).filter(Boolean));
  const j = jour || jourIso();
  // Une note écrite sur plusieurs lignes ne prend qu'une date, sur sa première.
  let precedenteNouvelle = false;
  return String(nouveau || '').split('\n').map(l => {
    const t = l.trim();
    if (!t) { precedenteNouvelle = false; return l; }
    if (MARQUE_JOURNAL.test(l) || avant.has(t)) { precedenteNouvelle = false; return l; }
    if (precedenteNouvelle) return l;
    precedenteNouvelle = true;
    return '[' + j + '] ' + t;
  }).join('\n');
}

// ---------- Presse-papier ----------

// Un widget Grist vit dans une iframe, et l'API presse-papier moderne y est
// souvent refusée (permission non déléguée, ou contexte jugé non sécurisé).
// D'où le repli sur la vieille méthode : un textarea hors écran, sélectionné,
// puis execCommand('copy') — dépréciée mais encore honorée partout, et seule
// à marcher dans ce cadre. Retourne true si la copie a eu lieu, pour que
// l'appelant puisse proposer autre chose sinon.
async function copierTexte(texte) {
  if (!texte) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch (err) { /* iframe sans la permission : on tente le repli */ }
  try {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.top = '-1000px';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    zone.setSelectionRange(0, texte.length); // iOS ignore select() seul
    const ok = document.execCommand('copy');
    document.body.removeChild(zone);
    return ok;
  } catch (err) {
    console.error('copierTexte', err);
    return false;
  }
}

// Message bref, en bas de l'écran : une copie réussie ne mérite pas une
// fenêtre, mais ne rien dire laisserait douter que le clic a porté.
let toastTimer = null;
function toast(message, erreur) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast' + (erreur ? ' toast-error' : '') + ' show';
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2600);
}
