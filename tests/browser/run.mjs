import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockScript } from './mock-grist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..'); // repo root, two levels up from tests/browser/

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(label); console.log('  ✗ FAIL ' + label); }
}

// Opens `file` (a widget html) in a fresh page with window.grist replaced by
// our mock, and the REST /tables/{id}/columns endpoint stubbed from
// cfg.columnsMeta. Returns { page, consoleErrors }.
async function openWidget(browser, file, cfg) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  const mockScript = buildMockScript(cfg);
  await page.route('**/grist-plugin-api.js', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: mockScript });
  });
  await page.route('**/tables/*/columns*', (route) => {
    const url = new URL(route.request().url());
    const tableId = decodeURIComponent(url.pathname.split('/tables/')[1].split('/')[0]);
    const meta = (cfg.columnsMeta && cfg.columnsMeta[tableId]) || [];
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ columns: meta }) });
  });
  await page.route('**/attachments*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  // This sandbox's egress proxy doesn't allow Playwright's own network stack
  // out to jsdelivr — stub marked/DOMPurify so pages that load them (CR
  // markdown legacy-conversion) don't error; irrelevant to what's tested here.
  await page.route('**/cdn.jsdelivr.net/**/marked*', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: 'window.marked = { parse: (s) => s };' });
  });
  await page.route('**/cdn.jsdelivr.net/**/purify*', (route) => {
    route.fulfill({ contentType: 'application/javascript', body: 'window.DOMPurify = { sanitize: (s) => s };' });
  });

  await page.goto('file://' + path.join(REPO, file));
  await page.waitForTimeout(150); // let the async onRecords/onRecord fire
  return { page, context, consoleErrors };
}

function choiceCol(id, choices) {
  return { id, fields: { type: 'Choice', widgetOptions: JSON.stringify({ choices }) } };
}

async function testInteractionsCreateFlow(browser) {
  console.log('\n=== interactions.html : création liée à une structure sans interaction existante ===');
  const cfg = {
    widgetTableId: 'Interactions',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Interactions: {
        colIds: ['Date', 'Type', 'Partenaires', 'Objet', 'ContactPartenaire', 'EtablissementCluster',
          'LaboratoireCluster', 'EquipeCluster', 'ContactCluster', 'ProchaineEcheance', 'Suites',
          'Opportunites', 'CR', 'PJ'],
        data: { id: [] } // exactly the reported bug scenario: zero interactions for this structure yet
      },
      Structures: { colIds: ['nom_acteur'], data: { id: [100, 101], nom_acteur: ['Quarkslab', 'Orange'] } },
      Contacts: { colIds: ['Nom_Complet'], data: { id: [200], Nom_Complet: ['Alain Pierre'] } },
      Opportunites: { colIds: ['Sujet'], data: { id: [] } }
    },
    // identity mapping: role name === raw colId (matches how this codebase's
    // widgets are actually configured against their real Grist docs)
    mappings: {
      Date: 'Date', Type: 'Type', Partenaires: 'Partenaires', Objet: 'Objet',
      ContactPartenaire: 'ContactPartenaire', EtablissementCluster: 'EtablissementCluster',
      LaboratoireCluster: 'LaboratoireCluster', EquipeCluster: 'EquipeCluster',
      ContactCluster: 'ContactCluster', ProchaineEcheance: 'ProchaineEcheance', Suites: 'Suites',
      Opportunites: 'Opportunites', CR: 'CR', PJ: 'PJ'
    },
    // Simulates the page's "Sélectionné par" link: only interactions whose
    // Partenaires includes structure #100 (Quarkslab) are visible here.
    filterExprSource: "(rec) => Array.isArray(rec.Partenaires) && rec.Partenaires.includes(100)",
    columnsMeta: {
      Interactions: [choiceCol('Type', ['Evènement', 'Réunion', 'Visio', 'Webinaire'])]
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'interactions.html', cfg);

  ok((await page.locator('.empty-list').textContent() || '').includes('Aucune interaction'),
    'liste vide au chargement (aucune interaction liée à Quarkslab)');

  await page.click('#btn-new');
  await page.waitForTimeout(50);
  ok(await page.locator('#create-modal').isVisible(), 'le formulaire "Nouvelle interaction" s\'ouvre');

  // Partenaire(s) field must render above Compte-rendu (visible without scrolling)
  const order = await page.evaluate(() => {
    const grid = document.querySelector('.form-modal-grid');
    const kids = [...grid.children].map(c => c.id || c.querySelector('label')?.textContent || '');
    return kids;
  });
  const partenaireIdx = order.findIndex(t => /Partenaire/i.test(t));
  const crIdx = order.findIndex(t => /Compte-rendu/i.test(t));
  ok(partenaireIdx >= 0 && partenaireIdx < crIdx, 'le champ Partenaire(s) est positionné avant Compte-rendu');

  // Type dropdown must include "Webinaire" even though no interaction uses it yet
  const typeOptions = await page.locator('#new-type option').allTextContents();
  ok(typeOptions.includes('Webinaire'), 'le sélecteur Type inclut "Webinaire" (choix Grist non encore utilisé)');

  // Submit with Objet filled but no Partenaire: must be BLOCKED
  await page.fill('#new-objet', 'Webinaire cybersécurité');
  await page.click('#create-submit');
  await page.waitForTimeout(50);
  ok((await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'create').length)) === 0,
    'la création est bloquée tant qu\'aucun partenaire n\'est choisi');
  ok(await page.locator('#new-partenaire-hint').evaluate(el => el.classList.contains('error')),
    'le message d\'aide passe en rouge quand le partenaire manque');

  // Add the Quarkslab chip via the ref-picker
  await page.fill('#new-ref-partenaires .ref-input', 'Quarkslab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  ok(await page.locator('#new-ref-partenaires .ref-chip').first().textContent().then(t => t.includes('Quarkslab')),
    'le chip "Quarkslab" est ajouté au picker Partenaire(s)');

  await page.click('#create-submit');
  await page.waitForTimeout(150);

  const createCalls = await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'create'));
  ok(createCalls.length === 1, 'exactement un appel create() a été effectué');
  if (createCalls.length === 1) {
    const fields = createCalls[0].arg.fields;
    ok(fields.Objet === 'Webinaire cybersécurité', 'Objet est bien envoyé');
    ok(Array.isArray(fields.Partenaires) && fields.Partenaires[0] === 'L' && fields.Partenaires.includes(100),
      'Partenaires est écrit comme ["L", 100] (Quarkslab)');
  }

  ok(!(await page.locator('#create-modal').isVisible()), 'le formulaire se ferme après création');

  // The whole point of the fix: the newly created interaction must now show
  // up in this Quarkslab-filtered list, not silently disappear.
  const listText = await page.locator('#list').textContent();
  ok(listText.includes('Webinaire cybersécurité'),
    'l\'interaction créée apparaît immédiatement dans la liste (liée à Quarkslab)');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');

  await context.close();
}

async function testIndexChoiceSelects(browser) {
  console.log('\n=== index.html : champs Choix (Taille, Type, Catégorie, Activité) ===');
  const cfg = {
    widgetTableId: 'Structures',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Structures: {
        colIds: ['nom_acteur', 'description', 'type_acteur', 'acteur_categorie', 'entreprise_activite',
          'entreprise_taille', 'recherche_structure', 'recherche_equipe_activite', 'recherche_equipe_labo',
          'axe_sequoia', 'pilier_sequoia', 'url_site_web'],
        data: {
          id: [1],
          nom_acteur: ['Quarkslab'], description: ['R&D / reverse / logiciels'],
          type_acteur: ['Economique'], acteur_categorie: ['Partenaire'],
          entreprise_activite: ['Cybersécurité'], entreprise_taille: ['PME'],
          recherche_structure: [''], recherche_equipe_activite: [''], recherche_equipe_labo: [''],
          axe_sequoia: ['IA & cybersécurité'], pilier_sequoia: ['IA & sécurité'],
          url_site_web: ['https://www.quarkslab.com']
        }
      }
    },
    cursorRowId: 1,
    columnsMeta: {
      Structures: [
        choiceCol('type_acteur', ['Economique', 'Recherche', 'Institutionnel']),
        choiceCol('acteur_categorie', ['Partenaire', 'Prospect']),
        choiceCol('entreprise_activite', ['Cybersécurité', 'IA', 'Data']),
        choiceCol('entreprise_taille', ['PME', 'ETI', 'GE'])
      ]
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'index.html', cfg);

  // enter edit mode via the pencil button
  const editBtn = page.locator('#toggle-edit');
  await editBtn.waitFor({ state: 'visible', timeout: 5000 });
  await editBtn.click();
  await page.waitForTimeout(150);

  ok((await page.locator('#f-entreprise-taille').evaluate(el => el.tagName)) === 'SELECT',
    'Taille est un <select> (pas un champ texte libre)');
  const tailleOptions = await page.locator('#f-entreprise-taille option').allTextContents();
  ok(tailleOptions.includes('ETI') && tailleOptions.includes('GE'),
    'Taille propose ETI et GE même si la fiche actuelle est PME');
  ok(await page.locator('#f-entreprise-taille').inputValue() === 'PME',
    'la valeur actuelle (PME) reste sélectionnée après le peuplement async');

  // Change Taille -> ETI and verify the write (saveField debounces 700ms)
  await page.selectOption('#f-entreprise-taille', 'ETI');
  await page.waitForTimeout(900);
  const updateCalls = await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'update'));
  const tailleUpdate = updateCalls.find(c => c.arg.fields && 'entreprise_taille' in c.arg.fields);
  ok(!!tailleUpdate && tailleUpdate.arg.fields.entreprise_taille === 'ETI',
    'changer Taille vers ETI déclenche bien un update() avec la bonne colonne/valeur');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testContactsHeaderNomComplet(browser) {
  console.log('\n=== contacts.html : header utilise Nom Complet ===');
  const cfg = {
    widgetTableId: 'Contacts',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Contacts: {
        colIds: ['Nom', 'Prenom', 'NomComplet', 'Fonction', 'Structures', 'Email', 'Telephone', 'Linkedin', 'ContactPrincipal', 'Commentaire'],
        data: {
          id: [200], Nom: ['Pierre'], Prenom: ['Alain'], NomComplet: ['Alain Pierre (Neverhack)'],
          Fonction: ['RSSI'], Structures: [null], Email: ['alain.pierre@neverhack.com'],
          Telephone: [''], Linkedin: [''], ContactPrincipal: [false], Commentaire: ['']
        }
      },
      Structures: { colIds: ['nom_acteur'], data: { id: [], nom_acteur: [] } }
    },
    cursorRowId: 200
  };
  const { page, context, consoleErrors } = await openWidget(browser, 'contacts.html', cfg);
  // contacts.html deliberately doesn't auto-open the fiche on load — only a
  // list click does (avoids loading a contact's fields before asked).
  await page.locator('.list-item').first().click();
  await page.waitForTimeout(100);
  const headerText = await page.locator('.header-text h1').first().textContent().catch(() => '');
  ok((headerText || '').includes('Alain Pierre (Neverhack)'),
    'le header affiche la colonne Nom Complet, pas la concaténation Nom+Prénom');
  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testContactsCreateFlow(browser) {
  console.log('\n=== contacts.html : création "+ Nouveau contact" ===');
  const cfg = {
    widgetTableId: 'Contacts',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Contacts: {
        colIds: ['Nom', 'Prenom', 'NomComplet', 'Fonction', 'Structures', 'Email', 'Telephone', 'Linkedin', 'ContactPrincipal', 'Commentaire'],
        data: { id: [] }
      },
      Structures: { colIds: ['nom_acteur'], data: { id: [], nom_acteur: [] } }
    }
  };
  const { page, context, consoleErrors } = await openWidget(browser, 'contacts.html', cfg);
  await page.click('#btn-new');
  await page.waitForTimeout(50);
  ok(await page.locator('#create-modal').isVisible(), 'le formulaire "Nouveau contact" s\'ouvre');

  // Nom is required
  await page.click('#create-submit');
  await page.waitForTimeout(50);
  ok((await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'create').length)) === 0,
    'la création est bloquée sans Nom');

  await page.fill('#new-nom', 'Doyen');
  await page.fill('#new-prenom', 'Guillaume');
  await page.fill('#new-email', 'guillaume.doyen@example.com');
  await page.click('#create-submit');
  await page.waitForTimeout(100);

  const createCalls = await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'create'));
  ok(createCalls.length === 1, 'exactement un appel create() a été effectué');
  if (createCalls.length === 1) {
    const fields = createCalls[0].arg.fields;
    ok(fields.Nom === 'Doyen' && fields.Prenom === 'Guillaume', 'Nom et Prénom sont bien envoyés');
    ok(!('NomComplet' in fields), 'NomComplet (colonne formule Grist) n\'est pas écrit — Grist la calcule seul');
  }
  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testOpportunitesDateSave(browser) {
  console.log('\n=== opportunites.html : la Date de début se sauvegarde ===');
  const cfg = {
    widgetTableId: 'Opportunites',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Opportunites: {
        colIds: ['Sujet', 'Type', 'Partenaires', 'EtablissementCluster', 'LaboratoireCluster', 'EquipeCluster',
          'AxeSequoia', 'Statut', 'ContactCluster', 'ContactPartenaire', 'DateDebut', 'Echeance', 'Montant', 'Commentaire'],
        data: {
          id: [1], Sujet: ['POC détection'], Type: ['POC'], Partenaires: [null], EtablissementCluster: [null],
          LaboratoireCluster: [null], EquipeCluster: [null], AxeSequoia: ['IA'], Statut: ['Qualification'],
          ContactCluster: [null], ContactPartenaire: [null], DateDebut: [null], Echeance: [null], Montant: [null],
          Commentaire: ['']
        }
      },
      Structures: { colIds: ['nom_acteur'], data: { id: [], nom_acteur: [] } },
      Contacts: { colIds: ['Nom_Complet'], data: { id: [], Nom_Complet: [] } }
    }
  };
  const { page, context, consoleErrors } = await openWidget(browser, 'opportunites.html', cfg);
  await page.locator('.opp-card').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.opp-card').first().click();
  await page.waitForTimeout(100);
  await page.locator('#modal #toggle-edit').click(); // view mode has no editable input, switch to edit
  await page.waitForTimeout(100);

  const dateInput = page.locator('#f-date-debut');
  if (await dateInput.count()) {
    await dateInput.fill('2026-09-15');
    await dateInput.dispatchEvent('input');
    await page.waitForTimeout(900); // createFieldSaver debounces ~700ms
    const updateCalls = await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'update'));
    const dateUpdate = updateCalls.find(c => c.arg.fields && 'DateDebut' in c.arg.fields);
    ok(!!dateUpdate && dateUpdate.arg.fields.DateDebut != null,
      'modifier la Date de début déclenche un update() avec une valeur non nulle');
  } else {
    ok(false, 'champ Date de début introuvable dans la fiche (sélecteur à vérifier)');
  }
  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

// PLAYWRIGHT_CHROMIUM_PATH lets a sandboxed/offline environment point at a
// pre-installed browser (no network access to download one); omit it to use
// Playwright's own managed install (after `npx playwright install chromium`).
const launchOpts = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
try {
  await testInteractionsCreateFlow(browser);
  await testIndexChoiceSelects(browser);
  await testContactsHeaderNomComplet(browser);
  await testContactsCreateFlow(browser);
  await testOpportunitesDateSave(browser);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); }
process.exit(fail ? 1 : 0);
