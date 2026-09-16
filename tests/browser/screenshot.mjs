// Aperçu visuel : ouvre un widget avec le faux window.grist et le jeu de
// données de démonstration, puis enregistre des captures PNG. Sert à vérifier
// le rendu sans brancher le widget dans Grist.
//
//   npm run preview                     -> tests/browser/screenshots/*.png
//   npm run preview -- --width 1200     -> largeur personnalisée
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMockScript } from './mock-grist.mjs';
import { crmConfig } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');

const args = process.argv.slice(2);
const widthArg = args.indexOf('--width');
const WIDTH = widthArg >= 0 ? Number(args[widthArg + 1]) : 1440;
const HEIGHT = 940;

fs.mkdirSync(OUT, { recursive: true });

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (err) => console.error('  ! erreur page :', err.message));

const cfg = crmConfig();
await page.route('**/grist-plugin-api.js', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: buildMockScript(cfg) }));
await page.route('**/tables/*/columns*', (route) => {
  const tableId = decodeURIComponent(new URL(route.request().url()).pathname.split('/tables/')[1].split('/')[0]);
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ columns: (cfg.columnsMeta || {})[tableId] || [] }) });
});
let uploadSeq = 9000;
await page.route('**/attachments**', (route) => {
  const m = new URL(route.request().url()).pathname.match(/\/attachments\/(\d+)(\/download)?$/);
  if (m && m[2]) return route.fulfill({ contentType: 'application/octet-stream', body: 'mock' });
  if (m) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ fileName: 'CR_Thales_2026-03-14.pdf', fileSize: 2048 }) });
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify([++uploadSeq]) });
});
// Pas de réseau sortant depuis ce bac à sable : on simule marked/DOMPurify.
await page.route('**/cdn.jsdelivr.net/**/marked*', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: 'window.marked = { parse: (s) => s };' }));
await page.route('**/cdn.jsdelivr.net/**/purify*', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: 'window.DOMPurify = { sanitize: (s) => s };' }));

async function shoot(name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  console.log('  → ' + path.relative(REPO, file));
}

await page.goto('file://' + path.join(REPO, 'crm.html'));
await page.waitForFunction(() => window.__crm && window.__crm.related && window.__crm.related.contacts.tableId, null, { timeout: 5000 });

await page.locator('.list-item', { hasText: 'Thales' }).click();
await page.waitForTimeout(400);
await shoot('crm-fiche');

await page.click('#btn-edit-structure');
await page.waitForTimeout(400);
await shoot('crm-modal-structure');
await page.click('.form-modal-actions [data-close]');
await page.waitForTimeout(300);

await page.locator('.tl-last').click();
await page.waitForTimeout(500);
await shoot('crm-modal-interaction');
await page.click('.form-modal-actions [data-close]');
await page.waitForTimeout(300);

await page.setViewportSize({ width: 620, height: 900 });
await page.waitForTimeout(300);
await shoot('crm-etroit');

await browser.close();
console.log('Aperçus enregistrés dans ' + path.relative(REPO, OUT));
