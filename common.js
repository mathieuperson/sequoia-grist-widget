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

// Fixed color for each opportunity Statut — a "funnel" progression from
// cool/neutral (early stage) to warm/green (won), red standing apart for
// "Abandonné". Matches the --status-* tokens in common.css and should
// mirror the choice colors set in Grist for the Statut column.
const STATUS_COLORS = {
  'prospection': 'var(--status-prospection)',
  'qualification': 'var(--status-qualification)',
  'montage': 'var(--status-montage)',
  'contractualisation': 'var(--status-contractualisation)',
  'concrétisé': 'var(--status-concretise)',
  'concretise': 'var(--status-concretise)',
  'abandonné': 'var(--status-abandonne)',
  'abandonne': 'var(--status-abandonne)'
};

function statusColor(status) {
  if (!status) return 'var(--status-default)';
  const key = String(status).trim().toLowerCase();
  return STATUS_COLORS[key] || 'var(--status-default)';
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

async function uploadAttachments(files) {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: false });
  const form = new FormData();
  for (const file of files) form.append('upload', file, file.name);
  const res = await fetch(`${baseUrl}/attachments?auth=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: form
  });
  if (!res.ok) throw new Error('Échec de l\'upload (' + res.status + ')');
  const data = await res.json();
  // Response shape: array of ids, or array of {id} objects depending on version.
  return (Array.isArray(data) ? data : data.rows || []).map(x => (typeof x === 'object' ? x.id : x));
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
    const cols = (data.columns || []).map(c => ({
      id: c.id,
      type: (c.fields && c.fields.type) || '',
      label: (c.fields && c.fields.label) || c.id,
      isFormula: !!(c.fields && c.fields.isFormula)
    }));
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
