// Aperçu visuel du widget de pilotage : ouvre pilotage.html avec le faux
// window.grist et le jeu d'essai, puis enregistre une capture par vue.
// Sert à vérifier la mise en page — ce que les tests ne font pas.
//
//   npm run preview:pilotage
//   npm run preview:pilotage -- --width 1200
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMockScript } from './mock-grist.mjs';
import { pilotageConfig } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'screenshots');

const args = process.argv.slice(2);
const widthArg = args.indexOf('--width');
const WIDTH = widthArg >= 0 ? Number(args[widthArg + 1]) : 1440;

fs.mkdirSync(OUT, { recursive: true });

const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
const cfg = pilotageConfig();

async function shot(name, { width = WIDTH, height = 1000, view = null, narrow = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  ! erreur page :', err.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  ! console :', m.text()); });
  await page.route('**/grist-plugin-api.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: buildMockScript(pilotageConfig()) }));
  await page.route('**/tables/*/columns*', (r) => {
    const tableId = decodeURIComponent(new URL(r.request().url()).pathname.split('/tables/')[1].split('/')[0]);
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ columns: (cfg.columnsMeta || {})[tableId] || [] }) });
  });
  await page.goto('file://' + path.join(REPO, 'pilotage.html'));
  await page.waitForSelector('#view-dashboard .pil-kpi');
  if (view) {
    await page.click(`.pil-nav-item[data-view="${view}"]`);
    await page.waitForTimeout(150);
  }
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: !narrow });
  console.log('  ✓ ' + path.relative(REPO, file));
  await context.close();
}

console.log('Captures du widget de pilotage (' + WIDTH + 'px) :');
await shot('pilotage-dashboard');
await shot('pilotage-projets', { view: 'projets' });
await shot('pilotage-actions', { view: 'actions' });
await shot('pilotage-etroit', { width: 900, height: 1100 });
await browser.close();
