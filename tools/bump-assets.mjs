// Estampille les liens vers les fichiers partagés (common.css, common.js,
// pilotage.js) d'un numéro de version.
//
// Pourquoi : un widget vit dans une iframe Grist, et son HTML est rechargé
// quand on rafraîchit la page — mais pas ses sous-ressources. Sans
// estampille, le navigateur peut servir un common.css vieux de plusieurs
// jours pendant que le HTML, lui, est à jour : le code est en ligne et
// l'utilisateur ne voit rien changer. C'est arrivé assez souvent pour
// mériter un outil.
//
//   npm run bump:assets            -> estampille avec la date du jour
//   npm run bump:assets -- 42      -> estampille avec une valeur donnée
//
// À lancer dès qu'un fichier partagé change, avant de committer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTAGES = ['common.css', 'common.js', 'pilotage.js'];

const donne = process.argv[2];
const version = donne || new Date().toISOString().slice(0, 10).replace(/-/g, '');

const widgets = fs.readdirSync(REPO).filter(f => f.endsWith('.html'));
let touches = 0;

widgets.forEach(fichier => {
  const chemin = path.join(REPO, fichier);
  const avant = fs.readFileSync(chemin, 'utf8');
  let apres = avant;
  PARTAGES.forEach(asset => {
    // Attrape le chemin avec ou sans « ./ », et remplace une estampille
    // existante plutôt que de l'empiler.
    const re = new RegExp('((?:href|src)=")(\\./)?' + asset.replace('.', '\\.') + '(\\?v=[^"]*)?(")', 'g');
    apres = apres.replace(re, (m, p1, prefixe, ancienne, fin) =>
      p1 + (prefixe || '') + asset + '?v=' + version + fin);
  });
  if (apres !== avant) {
    fs.writeFileSync(chemin, apres);
    touches++;
    console.log('  ✓ ' + fichier);
  }
});

console.log(touches
  ? '\nEstampille ' + version + ' posée sur ' + touches + ' widget(s).'
  : 'Rien à estampiller : aucun widget ne référence ' + PARTAGES.join(', ') + '.');
