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

async function getAttachmentDownloadUrl(id) {
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
  return `${baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(token)}`;
}
