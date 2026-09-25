// Estampille les liens vers les fichiers partagés (common.css, common.js,
// pilotage.js, espace.js) d'un numéro de version.
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
const PARTAGES = ['common.css', 'common.js', 'pilotage.js', 'espace.js'];

// Deux passages le même jour donneraient la même date, donc la même URL, donc
// le cache qu'on cherchait justement à contourner. À défaut de valeur donnée,
// on suffixe au-delà de la plus avancée des estampilles du jour déjà en place.
// Il ne suffit pas d'éviter celles qu'on voit : revenir de « 20260917a » à
// « 20260917 » rendrait une URL déjà servie, donc déjà en cache.
function versionDuJour() {
  const jour = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const enPlace = new Set();
  fs.readdirSync(REPO).filter(f => f.endsWith('.html')).forEach(f => {
    const html = fs.readFileSync(path.join(REPO, f), 'utf8');
    PARTAGES.forEach(asset => {
      const m = html.match(new RegExp(asset.replace('.', '\\.') + '\\?v=([^"]*)'));
      if (m) enPlace.add(m[1]);
    });
  });
  // Les estampilles du jour, suffixe compris, dans l'ordre : « », a, b, c…
  const duJour = Array.from(enPlace).filter(v => v.startsWith(jour)).sort();
  if (!duJour.length) return jour;
  const derniere = duJour[duJour.length - 1];
  const suffixe = derniere.slice(jour.length);
  const rang = suffixe ? suffixe.charCodeAt(0) - 96 : 0; // '' -> 0, 'a' -> 1…
  if (rang >= 0 && rang < 26) return jour + String.fromCharCode(97 + rang);
  return jour + '-' + Date.now();
}

const donne = process.argv[2];
const version = donne || versionDuJour();

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
