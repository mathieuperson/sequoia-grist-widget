// Tests des fonctions pures de espace.js. Même harnais que pilotage.test.mjs.
import fs from 'node:fs';
import vm from 'node:vm';

const src = ['../common.js', '../pilotage.js', '../espace.js']
  .map(f => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
const sandbox = { console, window: {}, document: undefined };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const e = sandbox.window.espace;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) pass++;
  else { fail++; console.log(`FAIL  ${label}\n      got:      ${a}\n      expected: ${b}`); }
}
const D = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
const NOW = D(2026, 9, 8);

// ---- Temps ----
eq(e.moisDe(D(2026, 3, 14)), '2026-03', 'moisDe');
eq(e.moisDe(null), null, 'moisDe: vide');
const serie = e.serieMensuelle([D(2026, 9, 1), D(2026, 9, 7), D(2026, 8, 3), D(2025, 1, 1)], NOW, 3);
eq(serie.map(m => [m.key, m.count]), [['2026-07', 0], ['2026-08', 1], ['2026-09', 2]], 'serieMensuelle: mois vides gardés, hors fenêtre ignoré');
eq(e.avancementTemps(D(2026, 9, 1), D(2026, 9, 11), D(2026, 9, 6)), 0.5, 'avancementTemps: moitié');
eq(e.avancementTemps(D(2026, 9, 1), D(2026, 9, 11), D(2027, 1, 1)), 1, 'avancementTemps: borné à 1');
eq(e.avancementTemps(null, D(2026, 9, 11), NOW), null, 'avancementTemps: sans début');
eq(e.joursAvant(D(2026, 9, 10), NOW), 2, 'joursAvant: futur positif');
eq(e.joursAvant(D(2026, 9, 1), NOW), -7, 'joursAvant: passé négatif');

// ---- Frise ----
eq(e.segmentAnnee(D(2026, 1, 1), D(2027, 1, 1), 2026), { left: 0, width: 100, coupeAvant: false, coupeApres: false }, 'segmentAnnee: année pleine');
const s = e.segmentAnnee(D(2025, 6, 1), D(2026, 7, 2), 2026);
eq([s.left, s.coupeAvant, s.coupeApres], [0, true, false], 'segmentAnnee: commencé avant');
eq(Math.round(s.width), 50, 'segmentAnnee: jusqu’à mi-année');
eq(e.segmentAnnee(D(2026, 7, 2), null, 2026).coupeApres, true, 'segmentAnnee: sans fin court jusqu’au bout');
eq(e.segmentAnnee(D(2024, 1, 1), D(2024, 6, 1), 2026), null, 'segmentAnnee: hors année');
eq(e.segmentAnnee(null, D(2026, 6, 1), 2026), null, 'segmentAnnee: sans début');

// ---- Classements ----
const top = e.topPartenaires(
  [{ partnerIds: [1, 2], stage: 'Montage' }, { partnerIds: [1], stage: 'Projet lancé' }, { partnerIds: [3], stage: 'Abandonné' }],
  [{ partnerIds: [2] }, { partnerIds: [2] }, { partnerIds: [3] }], 5);
eq(top.map(t => [t.id, t.projets, t.echanges]), [[1, 2, 0], [2, 1, 2], [3, 0, 1]], 'topPartenaires: projets actifs puis échanges, abandon ignoré');
const g = e.grouper([{ k: 'b' }, { k: 'a' }, { k: '' }, { k: 'z' }], x => x.k, ['a', 'b', 'c'], 'Vide');
eq(g.map(x => [x.cle, x.elements.length]), [['a', 1], ['b', 1], ['c', 0], ['Vide', 1], ['z', 1]], 'grouper: ordre imposé, colonnes vides gardées');

// ---- Alertes ----
const al = e.alertesEspace({
  projets: [{ id: 1, title: 'P1', stage: 'Montage', echeance: D(2026, 9, 20) },
    { id: 2, title: 'P2', stage: 'Abandonné', echeance: D(2026, 9, 10) },
    { id: 3, title: 'P3', stage: 'Montage', echeance: D(2026, 12, 20) }],
  actions: [{ id: 5, label: 'A5', due: D(2026, 9, 1), done: false }, { id: 6, label: 'A6', due: D(2026, 9, 1), done: true },
    { id: 7, label: 'A7', due: D(2026, 9, 12), done: false }, { id: 8, label: 'A8', due: D(2026, 10, 30), done: false }]
}, NOW, { vues: ['action:7'] });
eq(al.map(a => [a.id, a.jours, a.vue]), [['action:5', -7, false], ['action:7', 4, true], ['projet:1', 12, false]], 'alertesEspace: retard, semaine, échéance 30 j ; clos, fait et lointain exclus');

// ---- Graphe ----
const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const pos1 = e.dispositionGraphe(nodes, [['a', 'b'], ['b', 'c']], 400, 300);
const pos2 = e.dispositionGraphe(nodes, [['a', 'b'], ['b', 'c']], 400, 300);
eq(pos1, pos2, 'dispositionGraphe: déterministe');
eq(Object.values(pos1).every(p => p.x >= 40 && p.x <= 360 && p.y >= 40 && p.y <= 260), true, 'dispositionGraphe: dans le cadre');
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
eq(dist(pos1.a, pos1.b) < dist(pos1.a, pos1.d), true, 'dispositionGraphe: voisins plus proches que non reliés');
eq(e.dispositionGraphe([], [], 100, 100), {}, 'dispositionGraphe: vide');

// ---- Liens ----
eq(e.lireLiens('Dossier ANR | https://drive.example/x\nhttps://site.example\npas une url\n'),
  [{ libelle: 'Dossier ANR', url: 'https://drive.example/x' }, { libelle: 'https://site.example', url: 'https://site.example' }], 'lireLiens');
eq(e.ecrireLiens([{ libelle: 'Dossier', url: 'https://a.b' }, { libelle: 'https://c.d', url: 'https://c.d' }]), 'Dossier | https://a.b\nhttps://c.d', 'ecrireLiens');

console.log(`\n${pass} passed, ${fail} failed (espace)`);
if (fail) process.exit(1);
