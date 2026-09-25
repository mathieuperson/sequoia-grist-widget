// Aperçu visuel de l'Espace SequoIA : une capture par vue, plus une fiche
// projet ouverte. Sert à vérifier la mise en page — ce que les tests ne font pas.
//
//   npm run preview:espace
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMockScript } from './mock-grist.mjs';
import { espaceConfig, espaceFinanceConfig, sifacCsv } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
let erreurs = 0;

async function shot(name, { width = 1440, height = 1000, vue = null, apres = null, config = espaceConfig } = {}) {
  const cfg = config();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (err) => { erreurs++; console.error('  ! erreur page :', err.message); });
  page.on('console', (m) => { if (m.type() === 'error') { erreurs++; console.error('  ! console :', m.text()); } });
  await page.route('**/grist-plugin-api.js', (r) => r.fulfill({ contentType: 'application/javascript', body: buildMockScript(cfg) }));
  await page.route('**/tables/*/columns*', (r) => {
    const tableId = decodeURIComponent(new URL(r.request().url()).pathname.split('/tables/')[1].split('/')[0]);
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ columns: (cfg.columnsMeta || {})[tableId] || [] }) });
  });
  // Hors ligne : marked et DOMPurify remplacés par des doublures.
  await page.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'application/javascript',
    body: 'window.marked = { parse: (s) => s }; window.DOMPurify = { sanitize: (s) => s };' }));
  await page.route('**/attachments/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ fileName: 'CR_signe.pdf', fileSize: 2048 }) }));
  await page.goto('file://' + path.join(REPO, 'espace.html') + (vue ? '?vue=' + vue : ''));
  await page.waitForSelector('.es-inner');
  if (apres) await apres(page);
  await page.waitForTimeout(350);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  console.log('  ✓ ' + path.relative(REPO, file));
  await context.close();
}

console.log("Captures de l'Espace SequoIA :");
await shot('espace-dashboard', { height: 1500 });
await shot('espace-projets-cartes', { vue: 'projets' });
await shot('espace-projets-tableau', { vue: 'projets', apres: (p) => p.click('[data-set="projets.mode"][data-val="tableau"]') });
await shot('espace-projets-calendrier', { vue: 'projets', apres: (p) => p.click('[data-set="projets.mode"][data-val="calendrier"]') });
await shot('espace-projet-fiche', { vue: 'projets', apres: async (p) => {
  await p.click('.es-pcard >> text=VisionMer');
  await p.click('.es-sheet-tabs [data-tab="echanges"]');
} });
await shot('espace-partenaires', { vue: 'partenaires', height: 1100, apres: async (p) => {
  await p.click('.pa-item >> text=Thales'); await p.click('[data-deplier]');
} });
await shot('espace-partenaires-globale', { vue: 'partenaires', apres: (p) => p.click('[data-set="partenaires.mode"][data-val="tableau"]') });
await shot('espace-partenaires-cartes', { vue: 'partenaires', apres: (p) => p.click('[data-set="partenaires.mode"][data-val="cartes"]') });
await shot('espace-partenaires-graphe', { vue: 'partenaires', apres: (p) => p.click('[data-set="partenaires.mode"][data-val="graphe"]') });
await shot('espace-contacts', { vue: 'contacts' });
await shot('espace-actions', { vue: 'actions' });
await shot('espace-actions-calendrier', { vue: 'actions', apres: (p) => p.click('[data-set="actions.mode"][data-val="calendrier"]') });
await shot('espace-etroit', { width: 420, height: 900 });

// Finance : mise en place, import d'un export SIFAC, puis les trois vues.
const csv = { name: 'export_sifac_SEQUOIA-IA.csv', mimeType: 'text/csv', buffer: Buffer.from(sifacCsv(new Date().getFullYear()), 'utf8') };
const importerCsv = async (p) => {
  await p.click('[data-set="finance.sous"][data-val="import"]');
  await p.setInputFiles('#fin-fichier', csv);
  await p.waitForSelector('[data-fin-importer]');
};
const importe = async (p) => { await importerCsv(p); await p.click('[data-fin-importer]'); await p.waitForSelector('.fi-trier, .es-kpis'); };
await shot('espace-finance-installation', { vue: 'finance', height: 600 });
await shot('espace-finance-apercu', { vue: 'finance', config: espaceFinanceConfig, apres: importerCsv });
await shot('espace-finance-synthese', { vue: 'finance', config: espaceFinanceConfig, height: 1300, apres: importe });
await shot('espace-finance-depenses', { vue: 'finance', config: espaceFinanceConfig, apres: async (p) => {
  await importe(p); await p.click('[data-fin-voir="non-affectees"]');
} });
await shot('espace-finance-ecritures', { vue: 'finance', config: espaceFinanceConfig, apres: async (p) => {
  await importe(p); await p.click('[data-set="finance.sous"][data-val="ecritures"]');
} });
await shot('espace-finance-fiche', { vue: 'finance', config: espaceFinanceConfig, apres: async (p) => {
  await importe(p); await p.click('[data-set="finance.sous"][data-val="depenses"]'); await p.click('.fi-table tbody tr >> text=Serveur GPU');
} });
await browser.close();
if (erreurs) { console.error(erreurs + ' erreur(s)'); process.exit(1); }
