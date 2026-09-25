// Logique du widget « Espace SequoIA » (espace.html).
//
// Une application à onglets — tableau de bord, projets, partenaires,
// contacts, actions — qui reprend l'ergonomie d'un espace de gestion de
// laboratoire (barre d'onglets en pastilles, fiche latérale, vues cartes /
// tableau / calendrier, graphes de relations) sur le modèle de données du
// Cluster : Structures, Contacts, Interactions, Opportunités, Actions.
//
// Ici, seulement des fonctions pures : séries, alertes, frise, disposition
// des graphes. Ni `grist` ni DOM — couvertes par tests/espace.test.mjs.
// Écrit pour un <script> classique, chargé après common.js et pilotage.js
// (`normalizeKey`, `isStageIn`, `stageRank`… viennent de là).

const ESPACE_JOUR = 86400;

// ---------------------------------------------------------------------
// Temps
// ---------------------------------------------------------------------

// Clé de mois « 2026-03 » d'une date Grist (secondes UTC).
function moisDe(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d.getTime())) return null;
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

const ESPACE_MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Les `n` derniers mois jusqu'à celui de `now`, chacun avec le nombre de
// dates qui y tombent. Un mois sans rien reste dans la série, à zéro : un
// creux est une information.
function serieMensuelle(dates, now, n) {
  const nb = n || 12;
  const fin = new Date(Number(now) * 1000);
  const mois = [];
  for (let i = nb - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - i, 1));
    const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    mois.push({ key, label: ESPACE_MOIS_COURTS[d.getUTCMonth()], annee: d.getUTCFullYear(), count: 0 });
  }
  const index = {};
  mois.forEach(m => { index[m.key] = m; });
  (dates || []).forEach(ts => {
    const k = moisDe(ts);
    if (k && index[k]) index[k].count++;
  });
  return mois;
}

// Part du temps écoulée entre début et fin, bornée à [0, 1] ; null si l'une
// des deux dates manque ou si elles sont dans le désordre.
function avancementTemps(debut, fin, now) {
  const a = Number(debut), b = Number(fin);
  if (!a || !b || b <= a) return null;
  return Math.min(1, Math.max(0, (Number(now) - a) / (b - a)));
}

// Jours entiers de `now` jusqu'à `ts` : positif dans le futur.
function joursAvant(ts, now) {
  if (!ts) return null;
  return Math.round((Number(ts) - Number(now)) / ESPACE_JOUR);
}

// ---------------------------------------------------------------------
// Frise annuelle (vue calendrier des projets)
// ---------------------------------------------------------------------

// Place une période sur l'année `annee` en pourcentages de largeur. Une
// période sans fin court jusqu'au bout de l'année ; sans début, elle n'a pas
// de place. null quand elle ne touche pas l'année.
function segmentAnnee(debut, fin, annee) {
  if (!debut) return null;
  const a = Date.UTC(annee, 0, 1) / 1000;
  const b = Date.UTC(annee + 1, 0, 1) / 1000;
  const s = Number(debut);
  const e = fin ? Number(fin) : b;
  if (e < a || s >= b || e < s) return null;
  const gauche = (Math.max(s, a) - a) / (b - a);
  const droite = (Math.min(e, b) - a) / (b - a);
  return {
    left: Math.round(gauche * 1000) / 10,
    width: Math.max(0.8, Math.round((droite - gauche) * 1000) / 10),
    coupeAvant: s < a,
    coupeApres: e > b || !fin
  };
}

// ---------------------------------------------------------------------
// Classements
// ---------------------------------------------------------------------

// Les structures les plus engagées : projets actifs d'abord, échanges
// ensuite. `projets` : [{ partnerIds, stage }] ; `echanges` : [{ partnerIds }].
function topPartenaires(projets, echanges, n) {
  const score = {};
  const touche = (id) => (score[id] = score[id] || { id, projets: 0, echanges: 0 });
  (projets || []).forEach(p => {
    if (isStageIn(p.stage, 'clos')) return;
    new Set(p.partnerIds || []).forEach(id => { touche(id).projets++; });
  });
  (echanges || []).forEach(e => {
    new Set(e.partnerIds || []).forEach(id => { touche(id).echanges++; });
  });
  return Object.values(score)
    .sort((a, b) => (b.projets - a.projets) || (b.echanges - a.echanges) || (a.id - b.id))
    .slice(0, n || 5);
}

// Regroupe des éléments par clé, dans l'ordre de `ordre` puis celui
// d'arrivée pour les clés inconnues. Une clé vide va dans `sansCle`.
function grouper(items, cleDe, ordre, sansCle) {
  const groupes = new Map();
  (ordre || []).forEach(k => groupes.set(k, []));
  (items || []).forEach(it => {
    const k = cleDe(it) || sansCle || '';
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(it);
  });
  return Array.from(groupes.entries()).map(([cle, elements]) => ({ cle, elements }));
}

// ---------------------------------------------------------------------
// Alertes (la cloche)
// ---------------------------------------------------------------------

// Ce qui demande de l'attention, du plus pressant au moins pressant :
// actions en retard, échéances de projet dans `horizon` jours, actions à
// faire dans la semaine. `vues` : ids déjà consultés.
function alertesEspace(data, now, opts) {
  const o = opts || {};
  const horizon = o.horizon || 30;
  const vues = new Set(o.vues || []);
  const out = [];
  (data.projets || []).forEach(p => {
    if (!p.echeance || isStageIn(p.stage, 'clos') || isStageIn(p.stage, 'termine')) return;
    const j = joursAvant(p.echeance, now);
    if (j !== null && j >= 0 && j <= horizon) {
      out.push({ id: 'projet:' + p.id, type: 'Échéance projet', titre: p.title, jours: j, ref: { projet: p.id } });
    }
  });
  (data.actions || []).forEach(a => {
    if (a.done || !a.due) return;
    const j = joursAvant(a.due, now);
    if (j === null) return;
    if (j < 0) out.push({ id: 'action:' + a.id, type: 'Action en retard', titre: a.label, jours: j, ref: { action: a.id } });
    else if (j <= 7) out.push({ id: 'action:' + a.id, type: 'Action à venir', titre: a.label, jours: j, ref: { action: a.id } });
  });
  return out
    .map(a => Object.assign(a, { vue: vues.has(a.id) }))
    .sort((a, b) => a.jours - b.jours);
}

// ---------------------------------------------------------------------
// Graphe de relations
// ---------------------------------------------------------------------

// Disposition par forces, déterministe : les nœuds partent d'un cercle (et
// non du hasard), si bien que le même document donne toujours le même
// dessin. `nodes` : [{ id, poids? }] ; `edges` : [[idA, idB]].
// Rend { id: { x, y } } dans le cadre width × height, marges déduites
// (`marges` : { haut, droite, bas, gauche } — la droite plus large laisse
// la place aux libellés, écrits à droite des points).
function dispositionGraphe(nodes, edges, width, height, iterations, marges) {
  const W = width || 800, H = height || 500;
  const n = nodes.length;
  const pos = {};
  if (!n) return pos;
  const cx = W / 2, cy = H / 2;
  const r0 = Math.min(W, H) * 0.38;
  nodes.forEach((nd, i) => {
    const t = (2 * Math.PI * i) / n;
    pos[nd.id] = { x: cx + r0 * Math.cos(t), y: cy + r0 * Math.sin(t) };
  });
  if (n === 1) return { [nodes[0].id]: { x: cx, y: cy } };
  const k = Math.sqrt((W * H) / n) * 0.6;
  const liens = (edges || []).filter(([a, b]) => pos[a] && pos[b] && a !== b);
  let temp = W / 10;
  const iters = iterations || 220;
  for (let it = 0; it < iters; it++) {
    const disp = {};
    nodes.forEach(nd => { disp[nd.id] = { x: 0, y: 0 }; });
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i].id, b = nodes[j].id;
        let dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) { dx = 0.01 * (i - j); dy = 0.01; d = Math.sqrt(dx * dx + dy * dy); }
        const f = (k * k) / d;
        disp[a].x += (dx / d) * f; disp[a].y += (dy / d) * f;
        disp[b].x -= (dx / d) * f; disp[b].y -= (dy / d) * f;
      }
    }
    liens.forEach(([a, b]) => {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const f = (d * d) / k;
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    });
    // Une légère gravité garde les composantes isolées dans le cadre.
    nodes.forEach(nd => {
      const p = pos[nd.id], dd = disp[nd.id];
      dd.x += (cx - p.x) * 0.05 * k / 10;
      dd.y += (cy - p.y) * 0.05 * k / 10;
      const len = Math.max(0.01, Math.sqrt(dd.x * dd.x + dd.y * dd.y));
      p.x += (dd.x / len) * Math.min(len, temp);
      p.y += (dd.y / len) * Math.min(len, temp);
    });
    temp = Math.max(0.5, temp * 0.97);
  }
  // Recadrage dans le cadre, marges comprises.
  const mg = Object.assign({ haut: 40, droite: 40, bas: 40, gauche: 40 }, marges || {});
  const xs = nodes.map(nd => pos[nd.id].x), ys = nodes.map(nd => pos[nd.id].y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (W - mg.gauche - mg.droite) / Math.max(1, maxX - minX);
  const sy = (H - mg.haut - mg.bas) / Math.max(1, maxY - minY);
  const out = {};
  nodes.forEach(nd => {
    out[nd.id] = {
      x: Math.round(mg.gauche + (pos[nd.id].x - minX) * sx),
      y: Math.round(mg.haut + (pos[nd.id].y - minY) * sy)
    };
  });
  return out;
}

// ---------------------------------------------------------------------
// Liens (pièces jointes sous forme d'adresses)
// ---------------------------------------------------------------------
// Plutôt que d'envoyer des fichiers dans le document — ce que certaines
// instances refusent au widget —, un projet porte des liens vers les
// documents là où ils vivent déjà (drive, dépôt, site). Une ligne par lien,
// « Libellé | https://… », ou l'adresse seule.

function lireLiens(texte) {
  return String(texte || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.lastIndexOf('|');
    const libelle = i >= 0 ? l.slice(0, i).trim() : '';
    const url = (i >= 0 ? l.slice(i + 1) : l).trim();
    return { libelle: libelle || url, url };
  }).filter(x => /^https?:\/\//i.test(x.url));
}

function ecrireLiens(liens) {
  return (liens || []).map(x => (x.libelle && x.libelle !== x.url ? x.libelle + ' | ' : '') + x.url).join('\n');
}

if (typeof window !== 'undefined') {
  window.espace = {
    moisDe, serieMensuelle, avancementTemps, joursAvant, segmentAnnee,
    topPartenaires, grouper, alertesEspace, dispositionGraphe, lireLiens, ecrireLiens
  };
}
