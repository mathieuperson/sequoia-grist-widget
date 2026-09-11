import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockScript } from './mock-grist.mjs';
import { choiceCol, crmConfig } from './fixtures.mjs';

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
  // Attachments REST endpoints: upload (POST .../attachments), metadata
  // (GET .../attachments/{id}) and download (GET .../attachments/{id}/download).
  let uploadSeq = 9000;
  await page.route('**/attachments**', (route) => {
    const url = new URL(route.request().url());
    const m = url.pathname.match(/\/attachments\/(\d+)(\/download)?$/);
    if (m && m[2]) return route.fulfill({ contentType: 'application/octet-stream', body: 'mock-file' });
    if (m) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ fileName: 'fichier-' + m[1] + '.pdf', fileSize: 2048 }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([++uploadSeq]) });
  });
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
          id: [1, 2],
          nom_acteur: ['Quarkslab', 'ProspectCo'], description: ['R&D / reverse / logiciels', ''],
          type_acteur: ['Economique', 'Economique'],
          // "Prospect" is used by another record but deliberately NOT in the
          // column's formally configured choices below — reproduces the
          // reported bug (a Choice column carrying values typed before being
          // added to "Modifier les choix"; Grist still accepts them).
          acteur_categorie: ['Partenaire', 'Prospect'],
          entreprise_activite: ['Cybersécurité', ''], entreprise_taille: ['PME', ''],
          recherche_structure: ['', ''], recherche_equipe_activite: ['', ''], recherche_equipe_labo: ['', ''],
          axe_sequoia: ['IA & cybersécurité', ''], pilier_sequoia: ['IA & sécurité', ''],
          url_site_web: ['https://www.quarkslab.com', '']
        }
      }
    },
    cursorRowId: 1,
    columnsMeta: {
      Structures: [
        choiceCol('type_acteur', ['Economique', 'Recherche', 'Institutionnel']),
        choiceCol('acteur_categorie', ['Partenaire']), // "Prospect" intentionally missing here
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

  // Regression: "Prospect" is used by another record but absent from the
  // column's formally configured Choice list — must still show up (union).
  const categorieOptions = await page.locator('#f-acteur-categorie option').allTextContents();
  ok(categorieOptions.includes('Prospect'),
    'Catégorie propose aussi "Prospect" (valeur utilisée mais absente de la liste de choix Grist)');

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
      Structures: { colIds: ['nom_acteur'], data: { id: [100], nom_acteur: ['Neverhack'] } }
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

  // Structure is also required (regression: a contact created without one
  // never showed up in any Structure-filtered Contacts widget)
  await page.fill('#new-nom', 'Doyen');
  await page.click('#create-submit');
  await page.waitForTimeout(50);
  ok((await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'create').length)) === 0,
    'la création est bloquée sans structure');
  ok(await page.locator('#new-structure-hint').evaluate(el => el.classList.contains('error')),
    'le message d\'aide passe en rouge quand la structure manque');

  await page.fill('#new-ref-structures .ref-input', 'Neverhack');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
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
    ok(Array.isArray(fields.Structures) && fields.Structures[0] === 'L' && fields.Structures.includes(100),
      'Structures est écrit comme ["L", 100] (Neverhack)');
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

function epoch(y, m, d) { return Date.UTC(y, m - 1, d) / 1000; }

async function testCifreDashboard(browser) {
  console.log('\n=== cifre-financement.html : pivot Université > Entreprise > années ===');
  const cfg = {
    widgetTableId: 'Theses',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Theses: {
        colIds: ['Universite', 'Entreprise', 'DateDebut', 'EstCIFRE', 'DureeAnnees', 'MontantTotal'],
        data: {
          id: [1, 2, 3, 4],
          Universite: ['Université de Rennes', 'Université de Rennes', 'Université de Rennes', 'Université de Rennes'],
          Entreprise: ['Orange', 'Orange', 'Neverhack', 'Orange'],
          DateDebut: [epoch(2024, 9, 1), epoch(2025, 9, 1), epoch(2025, 1, 1), epoch(2023, 1, 1)],
          // record #4 is explicitly NOT a CIFRE — must be excluded entirely
          EstCIFRE: ['Oui', 'Oui', 'Oui', 'Non'],
          DureeAnnees: [null, null, null, null],
          MontantTotal: [null, null, null, null]
        }
      }
    },
    mappings: {
      Universite: 'Universite', Entreprise: 'Entreprise', DateDebut: 'DateDebut',
      EstCIFRE: 'EstCIFRE', DureeAnnees: 'DureeAnnees', MontantTotal: 'MontantTotal'
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'cifre-financement.html', cfg);
  await page.waitForTimeout(100);

  const pivot = await page.evaluate(() => window.__lastPivot);
  ok(pivot.totalNb === 3, 'la thèse marquée "Non" CIFRE est exclue (3 thèses comptées, pas 4)');
  const diagText = await page.locator('#diag-line').textContent();
  ok(diagText.includes('4 ligne(s) reçue(s) de Grist') && diagText.includes('3 comptée(s) comme CIFRE'),
    'la ligne de diagnostic distingue les lignes reçues de Grist (4) des lignes comptées comme CIFRE (3)');
  ok(pivot.totalMontant === 600000, 'montant total = 3 x 200k€ (défaut doctorant+contrat+encadrant)');
  ok(pivot.groupList.length === 1 && pivot.groupList[0].universite === 'Université de Rennes',
    'un seul groupe Université (Rennes)');

  const rennes = pivot.groupList[0];
  const orange = rennes.rows.find(r => r.entreprise === 'Orange');
  const neverhack = rennes.rows.find(r => r.entreprise === 'Neverhack');
  ok(!!orange && orange.nbCIFRE === 2 && orange.montantTotal === 400000, 'Orange : 2 CIFRE, 400k€');
  ok(!!neverhack && neverhack.nbCIFRE === 1 && neverhack.montantTotal === 200000, 'Neverhack : 1 CIFRE, 200k€');

  ok(JSON.stringify(pivot.years) === JSON.stringify([2024, 2025, 2026, 2027]),
    'les années couvertes vont de 2024 (1ère thèse) à 2027 (fin de la 2e thèse, durée 3 ans)');

  // 2025 and 2026 overlap both Orange theses (A: 2024-26, B: 2025-27) —
  // monétaire/an = (120k+40k)/3 = 53 333.33, doubled where they overlap.
  const near = (a, b) => Math.abs(a - b) < 1;
  ok(near(orange.perYear[2024].monetaire, 160000 / 3), '2024 Orange monétaire = 160k/3 (seule la 1ère thèse)');
  ok(near(orange.perYear[2025].monetaire, (160000 / 3) * 2), '2025 Orange monétaire = doublé (les 2 thèses se chevauchent)');
  ok(near(orange.perYear[2027].inKind, 40000 / 3), '2027 Orange in-kind = 40k/3 (seule la 2e thèse, fin de période)');

  const headerText = await page.locator('table.pivot thead').textContent();
  ok(['2024', '2025', '2026', '2027'].every(y => headerText.includes(y)), 'les 4 années apparaissent en en-tête du tableau');
  ok((await page.locator('.kpi-row').textContent()).includes('Universités'), 'les cartes KPI sont rendues');

  // Settings: bumping the default doctorant salary must change the totals.
  await page.click('#btn-settings');
  await page.waitForTimeout(50);
  await page.fill('#cfg-doctorant', '150000');
  await page.click('#settings-save');
  await page.waitForTimeout(100);
  const pivot2 = await page.evaluate(() => window.__lastPivot);
  ok(pivot2.totalMontant === 3 * (150000 + 40000 + 40000),
    'changer le salaire doctorant dans les Paramètres recalcule bien les montants');
  const optionCalls = await page.evaluate(() => window.__mockCalls.filter(c => c.fn === 'setOption'));
  ok(optionCalls.length >= 1, 'la config est persistée via grist.setOption (survivra à un rechargement)');

  // ---- Filters (multi-select checkbox dropdown) ----
  await page.click('#msf-entreprise .ms-filter-btn');
  await page.waitForTimeout(50);
  const entrepriseOptions = await page.locator('#msf-entreprise .ms-option').allTextContents();
  ok(entrepriseOptions.some(t => t.includes('Orange')) && entrepriseOptions.some(t => t.includes('Neverhack')),
    'le filtre Entreprise liste toutes les entreprises présentes');
  await page.click('#msf-entreprise .ms-option:has-text("Neverhack") input');
  await page.waitForTimeout(50);
  const filteredPivot = await page.evaluate(() => window.__lastPivot);
  ok(filteredPivot.totalNb === 1 && filteredPivot.groupList[0].rows[0].entreprise === 'Neverhack',
    'cocher Entreprise=Neverhack ne garde que sa thèse (1, pas 3)');
  ok((await page.locator('#msf-entreprise .ms-count').textContent()).includes('1 sélectionnée'),
    'le bouton affiche "1 sélectionnée"');
  ok(!(await page.locator('#filter-reset').isHidden()), 'le bouton Réinitialiser apparaît quand un filtre est actif');
  await page.click('#filter-reset');
  await page.waitForTimeout(50);
  const resetPivot = await page.evaluate(() => window.__lastPivot);
  ok(resetPivot.totalNb === 3, 'Réinitialiser restaure les 3 thèses');

  // Real multi-selection: check TWO values together, not just one.
  await page.click('#msf-entreprise .ms-filter-btn');
  await page.waitForTimeout(50);
  await page.click('#msf-entreprise .ms-option:has-text("Orange") input');
  await page.click('#msf-entreprise .ms-option:has-text("Neverhack") input');
  await page.waitForTimeout(50);
  const multiPivot = await page.evaluate(() => window.__lastPivot);
  ok(multiPivot.totalNb === 3, 'cocher Orange + Neverhack ensemble garde les 3 thèses (multi-sélection réelle)');
  await page.click('#filter-reset');
  await page.waitForTimeout(50);

  // ---- Chart view ----
  await page.click('#view-chart');
  await page.waitForTimeout(100);
  ok(await page.locator('#chart-view').isVisible(), 'la vue Graphique s\'affiche');
  ok((await page.locator('#chart-svg path').count()) > 0, 'le graphique dessine des barres (SVG <path>)');
  ok((await page.locator('#chart-svg circle').count()) > 0,
    'un marqueur de total (point) est dessiné au sommet des barres empilées');
  let legendText = await page.locator('#chart-legend').textContent();
  ok(legendText.includes('Monétaire') && legendText.includes('In-kind'),
    'légende par défaut (Aucun regroupement, Montant) : Monétaire / In-kind');

  await page.click('#groupby-toggle button[data-value="entreprise"]');
  await page.waitForTimeout(100);
  legendText = await page.locator('#chart-legend').textContent();
  ok(legendText.includes('Orange') && legendText.includes('Neverhack'),
    'regrouper par Entreprise : la légende liste les entreprises (Orange, Neverhack)');

  await page.click('#metric-toggle button[data-value="nombre"]');
  await page.waitForTimeout(100);
  ok((await page.locator('#chart-svg path').count()) > 0, 'le graphique se met à jour sur la mesure "Nombre de CIFRE"');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCifreDashboardTypeFinancementColumn(browser) {
  console.log('\n=== cifre-financement.html : régression "Type de financement" (colonne multi-valeurs, pas oui/non) ===');
  const cfg = {
    widgetTableId: 'Theses',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Theses: {
        colIds: ['Universite', 'Entreprise', 'DateDebut', 'TypeFinancement', 'DureeAnnees', 'MontantTotal'],
        data: {
          id: [1, 2, 3, 4, 5, 6, 7],
          Universite: ['Rennes', 'Rennes', 'Rennes', 'Rennes', 'Rennes', 'Rennes', 'Rennes'],
          Entreprise: ['Orange', 'Thales', 'InterDigital', 'Orange', 'Thales', 'Naval Group', 'Safran'],
          DateDebut: Array(7).fill(epoch(2023, 9, 1)),
          // A real "Type de financement" category column: CIFRE is only ONE
          // of many values (EUROPEEN, CDD STANDARD, a combo...). Only the
          // exact "CIFRE" modality counts — same as Grist's own column
          // filter — a combo like "CIFRE + ANR" is a distinct choice and is
          // NOT counted (explicit product decision: exact match, no
          // substring/token guessing). Row 6's blank value must not be
          // assumed to be CIFRE either.
          TypeFinancement: ['CIFRE', 'CDD STANDARD', 'CIFRE', 'EUROPEEN', 'CIFRE + ANR', '', 'CIFRE-INDUSTRIE'],
          DureeAnnees: Array(7).fill(null),
          MontantTotal: Array(7).fill(null)
        }
      }
    },
    mappings: {
      Universite: 'Universite', Entreprise: 'Entreprise', DateDebut: 'DateDebut',
      EstCIFRE: 'TypeFinancement', DureeAnnees: 'DureeAnnees', MontantTotal: 'MontantTotal'
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'cifre-financement.html', cfg);
  await page.waitForTimeout(100);
  const pivot = await page.evaluate(() => window.__lastPivot);

  ok(pivot.totalNb === 2,
    '"Type de financement" mappé : seules les 2 lignes valant exactement "CIFRE" comptent (pas EUROPEEN/CDD STANDARD/la ligne vide/les combos)');
  const diagText = await page.locator('#diag-line').textContent();
  ok(diagText.includes('7 ligne(s) reçue(s) de Grist') && diagText.includes('2 comptée(s) comme CIFRE'),
    'le diagnostic confirme 7 lignes reçues mais seulement 2 valent exactement CIFRE');

  // Transparency banner: the excluded raw values must be visible on-page,
  // not just inferred from the totals — this is what turns "je n'ai pas le
  // bon nombre" into something the user can read off the screen themselves.
  const warningsText = await page.locator('#warnings').textContent();
  ok(warningsText.includes('CDD STANDARD') && warningsText.includes('EUROPEEN') && warningsText.includes('(vide)') &&
     warningsText.includes('CIFRE + ANR') && warningsText.includes('CIFRE-INDUSTRIE'),
    'le bandeau liste les valeurs exclues, y compris les combos "CIFRE + ..." (ce ne sont pas la modalité "CIFRE")');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCifreDashboardLabAndKEuros(browser) {
  console.log('\n=== cifre-financement.html : filtre Laboratoire + montants en k€ + valeur CIFRE séparée par virgule ===');
  const cfg = {
    widgetTableId: 'Theses',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Theses: {
        colIds: ['Universite', 'Entreprise', 'DateDebut', 'TypeFinancement', 'Laboratoire', 'DureeAnnees', 'MontantTotal'],
        data: {
          id: [1, 2, 3],
          Universite: ['Rennes', 'Rennes', 'Rennes'],
          Entreprise: ['Orange', 'Thales', 'Naval Group'],
          DateDebut: Array(3).fill(epoch(2023, 9, 1)),
          // Row 3 ("CIFRE, PARTENAIRE", a ChoiceList-style combo) is a
          // distinct modality from the exact "CIFRE" choice and must NOT
          // count — only rows 1 and 2 do.
          TypeFinancement: ['CIFRE', 'CIFRE', 'CIFRE, PARTENAIRE'],
          Laboratoire: ['IRISA', 'Lab-STICC', 'IRISA'],
          DureeAnnees: Array(3).fill(null),
          MontantTotal: Array(3).fill(null)
        }
      }
    },
    mappings: {
      Universite: 'Universite', Entreprise: 'Entreprise', DateDebut: 'DateDebut',
      EstCIFRE: 'TypeFinancement', Laboratoire: 'Laboratoire', DureeAnnees: 'DureeAnnees', MontantTotal: 'MontantTotal'
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'cifre-financement.html', cfg);
  await page.waitForTimeout(100);
  const pivot = await page.evaluate(() => window.__lastPivot);
  ok(pivot.totalNb === 2, '"CIFRE, PARTENAIRE" (combo) ne compte PAS — seule la modalité exacte "CIFRE" compte (2 lignes, pas 3)');

  // Laboratoire filter
  await page.click('#msf-laboratoire .ms-filter-btn');
  await page.waitForTimeout(50);
  const labOptions = await page.locator('#msf-laboratoire .ms-option').allTextContents();
  ok(labOptions.some(t => t.includes('IRISA')) && labOptions.some(t => t.includes('Lab-STICC')),
    'le filtre Laboratoire liste les laboratoires présents');
  await page.click('#msf-laboratoire .ms-option:has-text("IRISA") input');
  await page.waitForTimeout(50);
  const labPivot = await page.evaluate(() => window.__lastPivot);
  ok(labPivot.totalNb === 1 && labPivot.groupList[0].rows[0].entreprise === 'Orange',
    'cocher Laboratoire=IRISA ne garde que la thèse Orange');
  await page.click('#filter-reset');
  await page.waitForTimeout(50);

  // Amounts displayed in k€, not raw euros
  const tableText = await page.locator('#pivot-table').textContent();
  ok(tableText.includes('200 k€') && !tableText.includes('200 000 €'),
    'les montants du tableau sont affichés en k€ (200 k€), pas en euros bruts');
  ok((await page.locator('.kpi-card .value').first().textContent().catch(() => '')) !== null,
    'les cartes KPI se chargent toujours');
  const kpiText = await page.locator('.kpi-row').textContent();
  ok(kpiText.includes('k€'), 'le KPI "Montant total investi" est aussi affiché en k€');

  // Chart: group by Laboratoire
  await page.click('#view-chart');
  await page.waitForTimeout(100);
  await page.click('#groupby-toggle button[data-value="laboratoire"]');
  await page.waitForTimeout(100);
  const labLegend = await page.locator('#chart-legend').textContent();
  ok(labLegend.includes('IRISA') && labLegend.includes('Lab-STICC'),
    'regrouper par Laboratoire : la légende liste les laboratoires (IRISA, Lab-STICC)');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

// ---------------------------------------------------------------------
// crm.html — la vue unifiée (structure + contacts + interactions + opportunités)
// ---------------------------------------------------------------------



async function openCrm(browser, cfg) {
  const res = await openWidget(browser, 'crm.html', cfg || crmConfig());
  // The related tables are fetched asynchronously after the first onRecords.
  await res.page.waitForFunction(() => window.__crm && window.__crm.related && window.__crm.related.contacts.tableId, null, { timeout: 5000 });
  return res;
}

const userActions = (page) => page.evaluate(() =>
  window.__mockCalls.filter(c => c.fn === 'applyUserActions').flatMap(c => c.actions));

async function testCrmFiche(browser) {
  console.log('\n=== crm.html : fiche 360 (lecture) ===');
  const { page, context, consoleErrors } = await openCrm(browser);

  ok((await page.locator('.list-item').count()) === 3, 'les 3 structures sont listées');

  // Column resolution across tables the widget isn't mapped onto.
  const cols = await page.evaluate(() => window.__crm.related);
  ok(cols.contacts.cols.NomComplet === 'Nom_Complet',
    'la colonne "Nom_Complet" est résolue toute seule pour le rôle NomComplet');
  ok(cols.contacts.cols.ContactPrincipal === 'Contact_Principal',
    'la colonne "Contact_Principal" est résolue pour le rôle ContactPrincipal');
  ok(cols.interactions.tableId === 'Interactions' && cols.opportunites.tableId === 'Opportunites',
    'les tables Interactions et Opportunites sont trouvées');

  await page.locator('.list-item', { hasText: 'Thales' }).click();
  await page.waitForTimeout(200);

  ok((await page.locator('.fiche-head h1').textContent()) === 'Thales', 'la fiche Thales s\'ouvre au clic');

  const kpis = await page.evaluate(() => window.__crm.kpis);
  ok(kpis.nbInteractions === 2, 'KPI interactions = 2 (celles de Zenika sont exclues)');
  ok(kpis.nbContacts === 2, 'KPI contacts = 2');
  ok(kpis.nbOpportunites === 3, 'KPI opportunités = 3');
  ok(kpis.montantTotal === 570000,
    'le montant cumulé exclut l\'opportunité abandonnée (570 k€ et non 1 470 k€)');
  ok(kpis.prochaineAction && kpis.prochaineAction.label === 'Envoyer la note de cadrage',
    'la prochaine action reprend les "Suites" de l\'échéance la plus proche');

  const kpiText = await page.locator('.kpi-row').textContent();
  ok(kpiText.includes('570 k€'), 'le montant est affiché en compact (570 k€)');
  ok(/\d+ j/.test(kpiText), 'le KPI "Dernier contact" affiche un nombre de jours');

  // Contacts
  const contactRows = page.locator('.contact-row');
  ok((await contactRows.count()) === 2, 'seuls les 2 contacts de Thales sont affichés');
  ok((await contactRows.first().textContent()).includes('Julien Bertin'),
    'le contact principal est remonté en tête de liste');
  ok((await contactRows.first().locator('.star').count()) === 1, 'le contact principal porte une étoile');

  // Opportunités
  ok((await page.locator('.opp-row').count()) === 3, 'les 3 opportunités de Thales sont listées');
  const oppFirst = await page.locator('.opp-row').first().textContent();
  ok(oppFirst.includes('Chaire IA de confiance') && oppFirst.includes('420 k€'),
    'l\'opportunité active la mieux dotée est en tête (l\'abandonnée à 900 k€ passe en dernier)');
  ok((await page.locator('.opp-row').last().textContent()).includes('Vieux projet'),
    'l\'opportunité abandonnée est reléguée en bas de liste');

  // Historique
  const last = await page.locator('.tl-last').textContent();
  ok(last.includes('Revue annuelle du partenariat'), 'le dernier échange affiche son objet');
  ok(last.includes('Thales confirme son intérêt'), 'le compte-rendu du dernier échange est rendu en clair');
  ok(last.includes('Réunion'), 'le type de l\'échange est affiché');
  ok(last.includes('Marie Lorrain') && last.includes('Julien Bertin'),
    'les contacts de l\'échange sont résolus en noms (pas en ids)');
  await page.waitForTimeout(150);
  ok((await page.locator('.tl-pj .pj-chip').count()) === 1, 'la pièce jointe du dernier CR est affichée');
  ok((await page.locator('.tl-item').count()) === 1, 'l\'échange plus ancien apparaît dans la timeline compacte');
  ok((await page.locator('.tl-item').textContent()).includes('Calage du budget'), 'avec son objet');

  // Structure sans données liées
  await page.locator('.list-item', { hasText: 'Inria' }).click();
  await page.waitForTimeout(200);
  const mainText = await page.locator('#main').textContent();
  ok(mainText.includes('Aucun contact rattaché'), 'structure sans contact : état vide explicite');
  ok(mainText.includes('Aucune interaction enregistrée'), 'structure sans interaction : état vide explicite');
  const kpis3 = await page.evaluate(() => window.__crm.kpis);
  ok(kpis3.joursDepuisContact === null && kpis3.nbInteractions === 0, 'KPI vides sans interaction');

  // Filtres
  await page.click('.filter-chip[data-filter="prospects"]');
  await page.waitForTimeout(100);
  ok((await page.locator('.list-item').count()) === 1 &&
     (await page.locator('.list-item').textContent()).includes('Zenika'),
    'le filtre "Prospects" ne garde que les structures de catégorie Prospect');
  await page.click('.filter-chip[data-filter="relancer"]');
  await page.waitForTimeout(100);
  ok((await page.locator('.list-item').count()) === 3,
    'le filtre "À relancer" remonte les structures sans contact récent');
  await page.click('.filter-chip[data-filter="tous"]');
  await page.fill('#search', 'zenika');
  await page.waitForTimeout(100);
  ok((await page.locator('.list-item').count()) === 1, 'la recherche filtre la liste');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCrmEdition(browser) {
  console.log('\n=== crm.html : édition depuis la vue (popups) ===');
  const { page, context, consoleErrors } = await openCrm(browser);
  await page.locator('.list-item', { hasText: 'Thales' }).click();
  await page.waitForTimeout(200);

  // ---- Fiche structure ----
  await page.click('#btn-edit-structure');
  await page.waitForTimeout(200);
  ok(await page.locator('#modal').isVisible(), 'la popup "Fiche structure" s\'ouvre');
  const tailleOptions = await page.locator('#m-taille option').allTextContents();
  ok(tailleOptions.includes('ETI'),
    'le champ Taille propose les choix Grist non encore utilisés (ETI)');
  await page.selectOption('#m-taille', 'ETI');
  await page.waitForTimeout(900); // autosave debounce
  let actions = await userActions(page);
  const tailleUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Structures' && a[3] && 'entreprise_taille' in a[3]);
  ok(!!tailleUpdate && tailleUpdate[3].entreprise_taille === 'ETI',
    'modifier la Taille écrit dans la table Structures (UpdateRecord)');
  await page.click('.form-modal-actions [data-close]');
  await page.waitForTimeout(250);
  ok(!(await page.locator('#modal').isVisible()), 'la popup se referme sur "Terminé"');
  ok((await page.locator('.fiche-head').textContent()).includes('ETI'),
    'la fiche reflète immédiatement la valeur enregistrée');

  // ---- Nouvelle interaction + compte-rendu ----
  await page.click('#btn-new-interaction');
  await page.waitForTimeout(200);
  await page.click('#m-create');
  await page.waitForTimeout(150);
  ok((await userActions(page)).filter(a => a[0] === 'AddRecord' && a[1] === 'Interactions').length === 0,
    'la création est bloquée sans objet');

  await page.fill('#m-objet', 'Point d\'avancement chaire');
  await page.fill('#m-suites', 'Relancer sur le co-financement');
  await page.fill('#m-ref-contacts .ref-input', 'Marie Lorrain');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  ok((await page.locator('#m-ref-contacts .ref-chip').count()) === 1,
    'le sélecteur ne propose que les contacts de la structure ouverte');

  await page.click('#m-create');
  await page.waitForTimeout(400);
  actions = await userActions(page);
  const add = actions.find(a => a[0] === 'AddRecord' && a[1] === 'Interactions');
  ok(!!add, 'l\'interaction est créée via applyUserActions sur la table Interactions');
  if (add) {
    ok(JSON.stringify(add[3].Partenaires) === JSON.stringify(['L', 1]),
      'elle est automatiquement liée à la structure ouverte (Partenaires = ["L", 1])');
    ok(JSON.stringify(add[3].ContactPartenaire) === JSON.stringify(['L', 10]),
      'le contact choisi est enregistré par son rowId');
    ok(add[3].Objet === 'Point d\'avancement chaire' && typeof add[3].Date === 'number',
      'objet et date (pré-remplie à aujourd\'hui) sont envoyés');
  }

  ok(await page.locator('#cr-editor').isVisible(),
    'la popup rebascule sur le formulaire complet : le compte-rendu est saisissable tout de suite');

  await page.locator('#cr-editor').click();
  await page.keyboard.type('Réunion de cadrage, budget confirmé.');
  await page.waitForTimeout(1100); // CR autosave debounce (800ms)
  actions = await userActions(page);
  const crUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Interactions' && a[3] && 'CR' in a[3]);
  ok(!!crUpdate && crUpdate[3].CR.includes('budget confirmé'),
    'le compte-rendu s\'enregistre tout seul pendant la frappe');

  // ---- Pièce jointe ----
  await page.setInputFiles('#pj-input', {
    name: 'note_cadrage.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock')
  });
  await page.waitForTimeout(400);
  actions = await userActions(page);
  const pjUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Interactions' && a[3] && 'PJ' in a[3]);
  ok(!!pjUpdate && Array.isArray(pjUpdate[3].PJ) && pjUpdate[3].PJ[0] === 'L' && pjUpdate[3].PJ.length === 2,
    'la pièce jointe téléversée est rattachée à l\'interaction (PJ = ["L", id])');
  ok((await page.locator('#pj-list .pj-item').count()) === 1, 'elle apparaît dans la liste des pièces jointes');

  await page.click('.form-modal-actions [data-close]');
  await page.waitForTimeout(300);
  ok((await page.locator('.tl-last').textContent()).includes('Point d\'avancement chaire'),
    'la nouvelle interaction devient le dernier échange de la timeline');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCrmContactsEtOpportunites(browser) {
  console.log('\n=== crm.html : contacts et opportunités depuis la vue ===');
  const { page, context, consoleErrors } = await openCrm(browser);
  await page.locator('.list-item', { hasText: 'Thales' }).click();
  await page.waitForTimeout(200);

  // ---- Nouveau contact ----
  await page.click('#btn-new-contact');
  await page.waitForTimeout(150);
  await page.fill('#m-nom', 'Fournier');
  await page.fill('#m-prenom', 'Nadia');
  await page.fill('#m-fonction', 'Ingénieure sécurité');
  await page.click('#m-create');
  await page.waitForTimeout(400);
  let actions = await userActions(page);
  const addContact = actions.find(a => a[0] === 'AddRecord' && a[1] === 'Contacts');
  ok(!!addContact, 'le contact est créé dans la table Contacts');
  if (addContact) {
    ok(JSON.stringify(addContact[3].Structures) === JSON.stringify(['L', 1]),
      'il est rattaché d\'office à la structure ouverte (plus de contact orphelin)');
    ok(!('Nom_Complet' in addContact[3]),
      'la colonne formule Nom_Complet n\'est pas écrite — Grist la calcule');
  }
  ok((await page.locator('.contact-row').count()) === 3, 'le nouveau contact apparaît dans la fiche');

  // ---- Édition d'un contact existant ----
  await page.locator('.contact-row', { hasText: 'Marie Lorrain' }).click();
  await page.waitForTimeout(150);
  await page.fill('#m-tel', '06 99 88 77 66');
  await page.waitForTimeout(900);
  actions = await userActions(page);
  const telUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Contacts' && a[3] && 'Telephone' in a[3]);
  ok(!!telUpdate && telUpdate[3].Telephone === '06 99 88 77 66',
    'éditer un champ du contact l\'enregistre sans quitter la vue');
  await page.click('.form-modal-actions [data-close]');
  await page.waitForTimeout(300);

  // ---- Opportunité : changement de statut ----
  await page.locator('.opp-row', { hasText: 'Chaire IA' }).click();
  await page.waitForTimeout(250);
  const statutOptions = await page.locator('#m-statut option').allTextContents();
  ok(statutOptions.includes('Concrétisé'),
    'le statut propose toute la liste de choix Grist (y compris les non utilisés)');
  await page.selectOption('#m-statut', 'Concrétisé');
  await page.waitForTimeout(900);
  actions = await userActions(page);
  const statutUpdate = actions.find(a => a[0] === 'UpdateRecord' && a[1] === 'Opportunites' && a[3] && 'Statut' in a[3]);
  ok(!!statutUpdate && statutUpdate[3].Statut === 'Concrétisé',
    'changer le statut écrit dans la table Opportunites');
  await page.click('.form-modal-actions [data-close]');
  await page.waitForTimeout(300);
  ok((await page.locator('.opp-row', { hasText: 'Chaire IA' }).textContent()).includes('Concrétisé'),
    'le nouveau statut est visible sur la fiche');

  // ---- Nouvelle opportunité ----
  await page.click('#btn-new-opp');
  await page.waitForTimeout(200);
  await page.fill('#m-sujet', 'Thèse CIFRE robustesse');
  await page.fill('#m-montant', '90000');
  await page.click('#m-create');
  await page.waitForTimeout(400);
  actions = await userActions(page);
  const addOpp = actions.find(a => a[0] === 'AddRecord' && a[1] === 'Opportunites');
  ok(!!addOpp && addOpp[3].Montant === 90000 && JSON.stringify(addOpp[3].Partenaires) === JSON.stringify(['L', 1]),
    'l\'opportunité créée est liée à la structure et porte son montant');
  ok((await page.locator('.opp-row').count()) === 4, 'elle apparaît immédiatement dans la fiche');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCrmSchemaDifferent(browser) {
  console.log('\n=== crm.html : document dont les colonnes portent d\'autres noms ===');
  const cfg = crmConfig();
  // Same data, columns named differently (accents, underscores, suffixes) —
  // the widget must still find Date / Compte-rendu / Pièce-jointe / Partenaires.
  cfg.tables.Interactions.colIds = ['Date_interaction', 'Type', 'Partenaire', 'Objet',
    'Contact_Partenaire', 'Prochaine_Echeance', 'Suites', 'Opportunites', 'Compte_rendu', 'Piece_jointe'];
  const d = cfg.tables.Interactions.data;
  cfg.tables.Interactions.data = {
    id: d.id, Date_interaction: d.Date, Type: d.Type, Partenaire: d.Partenaires, Objet: d.Objet,
    Contact_Partenaire: d.ContactPartenaire, Prochaine_Echeance: d.ProchaineEcheance, Suites: d.Suites,
    Opportunites: d.Opportunites, Compte_rendu: d.CR, Piece_jointe: d.PJ
  };
  cfg.columnsMeta.Interactions = [choiceCol('Type', ['Réunion', 'Appel'])];

  const { page, context, consoleErrors } = await openCrm(browser, cfg);
  await page.locator('.list-item', { hasText: 'Thales' }).click();
  await page.waitForTimeout(250);

  const cols = await page.evaluate(() => window.__crm.related.interactions.cols);
  ok(cols.Date === 'Date_interaction', 'le rôle Date est résolu sur "Date_interaction"');
  ok(cols.CR === 'Compte_rendu', 'le rôle CR est résolu sur "Compte_rendu"');
  ok(cols.PJ === 'Piece_jointe', 'le rôle PJ est résolu sur "Piece_jointe"');
  ok(cols.Partenaires === 'Partenaire', 'le rôle Partenaires est résolu sur "Partenaire"');
  ok((await page.evaluate(() => window.__crm.kpis.nbInteractions)) === 2,
    'les interactions sont bien rattachées malgré les noms de colonnes différents');
  ok((await page.locator('.tl-last').textContent()).includes('Thales confirme'),
    'le compte-rendu est retrouvé et affiché');

  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCrmTableManquante(browser) {
  console.log('\n=== crm.html : table liée absente du document ===');
  const cfg = crmConfig();
  delete cfg.tables.Opportunites;
  const { page, context, consoleErrors } = await openCrm(browser, cfg);
  await page.locator('.list-item', { hasText: 'Thales' }).click();
  await page.waitForTimeout(250);

  ok((await page.locator('#main').textContent()).includes('Table introuvable'),
    'le widget signale la table manquante au lieu de planter');
  ok((await page.locator('.contact-row').count()) === 2,
    'le reste de la fiche continue de fonctionner');
  ok(consoleErrors.length === 0, 'aucune erreur console (' + consoleErrors.join(' | ') + ')');
  await context.close();
}

async function testCifreDashboardNumericYear(browser) {
  console.log('\n=== cifre-financement.html : régression "Année" en colonne Numeric (pas une vraie Date Grist) ===');
  const cfg = {
    widgetTableId: 'Theses',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Theses: {
        colIds: ['Universite', 'Entreprise', 'Annee_debut', 'EstCIFRE', 'DureeAnnees', 'MontantTotal'],
        data: {
          id: [1, 2],
          Universite: ['IMT Atlantique', 'IMT Atlantique'],
          Entreprise: ['Orange Labs', 'Canon CRF'],
          // A bare Numeric "Année" column holding the calendar year (2022,
          // 2023) — not a real Grist Date (epoch seconds). Reproduces the
          // reported "1970/1971/1972" bug.
          Annee_debut: [2022, 2023],
          EstCIFRE: ['Oui', 'Oui'],
          DureeAnnees: [null, null],
          MontantTotal: [null, null]
        }
      }
    },
    mappings: {
      Universite: 'Universite', Entreprise: 'Entreprise', DateDebut: 'Annee_debut',
      EstCIFRE: 'EstCIFRE', DureeAnnees: 'DureeAnnees', MontantTotal: 'MontantTotal'
    }
  };

  const { page, context, consoleErrors } = await openWidget(browser, 'cifre-financement.html', cfg);
  await page.waitForTimeout(100);
  const pivot = await page.evaluate(() => window.__lastPivot);

  ok(JSON.stringify(pivot.years) === JSON.stringify([2022, 2023, 2024, 2025]),
    'les années sont 2022-2025 (pas 1970/1971/1972) quand "Année" est une colonne Numeric');
  ok(pivot.sansDate === 0, 'aucune thèse n\'est comptée "sans date" — la valeur Numeric est bien reconnue comme année');

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
  await testCifreDashboard(browser);
  await testCifreDashboardTypeFinancementColumn(browser);
  await testCifreDashboardLabAndKEuros(browser);
  await testCifreDashboardNumericYear(browser);
  await testCrmFiche(browser);
  await testCrmEdition(browser);
  await testCrmContactsEtOpportunites(browser);
  await testCrmSchemaDifferent(browser);
  await testCrmTableManquante(browser);
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); }
process.exit(fail ? 1 : 0);
