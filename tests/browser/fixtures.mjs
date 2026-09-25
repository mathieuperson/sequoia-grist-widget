// Jeux de données partagés entre la suite de tests et l'aperçu visuel
// (tests/browser/screenshot.mjs) — un seul endroit à mettre à jour quand le
// document Grist évolue.

// `choiceOptions` (optionnel) porte les couleurs que Grist enregistre pour
// chaque choix : c'est ce que les widgets lisent pour coller à la table.
export function choiceCol(id, choices, choiceOptions) {
  const opts = choiceOptions ? { choices, choiceOptions } : { choices };
  return { id, fields: { type: 'Choice', widgetOptions: JSON.stringify(opts) } };
}

export function refCol(id, type, label) {
  return { id, fields: { type, label } };
}

export const D = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;

export function crmConfig() {
  return {
    widgetTableId: 'Structures',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Structures: {
        colIds: ['nom_acteur', 'description', 'type_acteur', 'acteur_categorie', 'entreprise_activite',
          'entreprise_taille', 'axe_sequoia', 'pilier_sequoia', 'url_site_web', 'url_logo',
          'recherche_structure', 'recherche_equipe_activite', 'recherche_equipe_labo'],
        data: {
          // #4 (b<>com) n'a strictement rien de lié : c'est le cas "fiche vide".
          id: [1, 2, 3, 4],
          nom_acteur: ['Thales', 'Zenika', 'Inria Rennes', 'b<>com'],
          description: ['Groupe de défense et aéronautique', '', '', ''],
          type_acteur: ['Economique', 'Economique', 'Recherche', 'Recherche'],
          acteur_categorie: ['Partenaire', 'Prospect', 'Partenaire', 'Partenaire'],
          entreprise_activite: ['Défense', 'Conseil IT', '', ''],
          entreprise_taille: ['Grand groupe', 'PME', '', ''],
          axe_sequoia: ['IA de confiance', '', '', ''],
          pilier_sequoia: ['IA & sécurité', '', 'IA fondamentale', ''],
          url_site_web: ['https://www.thalesgroup.com', '', '', ''],
          url_logo: ['', '', '', ''],
          recherche_structure: ['', '', 'Inria', 'IRT'],
          recherche_equipe_activite: ['', '', '', ''],
          recherche_equipe_labo: ['', '', '', '']
        }
      },
      Contacts: {
        // Deliberately NOT named like the widget's role names: the widget has
        // to resolve Nom_Complet / Contact_Principal by itself.
        colIds: ['Nom', 'Prenom', 'Nom_Complet', 'Fonction', 'Structures', 'Email', 'Telephone',
          'Linkedin', 'Contact_Principal', 'Commentaire'],
        data: {
          id: [10, 11, 12],
          Nom: ['Lorrain', 'Bertin', 'Martin'],
          Prenom: ['Marie', 'Julien', 'Paul'],
          Nom_Complet: ['Marie Lorrain', 'Julien Bertin', 'Paul Martin'],
          Fonction: ['Directrice R&D', 'Responsable partenariats', 'Consultant'],
          Structures: [['L', 1], ['L', 1], ['L', 2]],
          Email: ['m.lorrain@thales.fr', 'j.bertin@thales.fr', 'p.martin@zenika.fr'],
          Telephone: ['', '06 12 34 56 78', ''],
          Linkedin: ['', '', ''],
          Contact_Principal: [false, true, false],
          Commentaire: ['', '', '']
        }
      },
      Interactions: {
        colIds: ['Date', 'Type', 'Partenaires', 'Objet', 'ContactPartenaire', 'ContactCluster',
          'LaboratoireCluster', 'ProchaineEcheance', 'Suites', 'Opportunites', 'CR', 'PJ'],
        data: {
          id: [20, 21, 22, 23],
          Date: [D(2026, 3, 14), D(2026, 1, 28), D(2025, 12, 9), D(2026, 5, 20)],
          Type: ['Réunion', 'Appel', 'Atelier', 'Visio'],
          // #23 est saisie depuis la fiche Zenika : Inria Rennes (#3) n'y
          // apparaît que comme laboratoire, jamais comme partenaire.
          Partenaires: [['L', 1], ['L', 1], ['L', 2], ['L', 2]],
          Objet: ['Revue annuelle du partenariat', 'Calage du budget', 'Atelier sécurité',
            'Montage thèse CIFRE'],
          ContactPartenaire: [['L', 10, 11], ['L', 11], ['L', 12], ['L', 12]],
          ContactCluster: [null, null, null, null],
          LaboratoireCluster: [null, null, null, ['L', 3]],
          // Far enough out that "prochaine action" stays in the future whenever
          // the suite runs.
          ProchaineEcheance: [D(2030, 3, 1), null, null, null],
          Suites: ['Envoyer la note de cadrage', '', '', ''],
          Opportunites: [null, null, null, null],
          CR: ['<p>Thales confirme son intérêt pour la chaire IA de confiance.</p>',
            '<p>Budget prévisionnel calé.</p>', '', '<p>Co-encadrement avec le laboratoire.</p>'],
          PJ: [['L', 501], null, null, null]
        }
      },
      Opportunites: {
        colIds: ['Sujet', 'Type', 'Partenaires', 'EtablissementCluster', 'AxeSequoia', 'Statut', 'DateDebut', 'Echeance',
          'Montant', 'Commentaire', 'ContactPartenaire', 'ContactCluster'],
        data: {
          id: [30, 31, 32],
          Sujet: ['Chaire IA de confiance', 'POC détection d\'intrusion', 'Vieux projet'],
          Type: ['Chaire', 'POC', 'POC'],
          Partenaires: [['L', 1], ['L', 1], ['L', 1]],
          EtablissementCluster: [null, null, null],
          AxeSequoia: ['IA de confiance', '', ''],
          Statut: ['Contractualisation', 'Montage', 'Abandonné'],
          DateDebut: [null, null, null],
          Echeance: [D(2030, 6, 1), null, null],
          Montant: [420000, 150000, 900000],
          Commentaire: ['', '', ''],
          ContactPartenaire: [null, null, null],
          ContactCluster: [null, null, null]
        }
      }
    },
    // The widget's roles mapped onto this document's real column ids.
    mappings: {
      Nom: 'nom_acteur', Description: 'description', TypeActeur: 'type_acteur',
      Categorie: 'acteur_categorie', Activite: 'entreprise_activite', Taille: 'entreprise_taille',
      AxeSequoia: 'axe_sequoia', PilierSequoia: 'pilier_sequoia', SiteWeb: 'url_site_web',
      Logo: 'url_logo', RechercheStructure: 'recherche_structure',
      RechercheEquipeActivite: 'recherche_equipe_activite', RechercheEquipeLabo: 'recherche_equipe_labo'
    },
    columnsMeta: {
      Structures: [
        choiceCol('type_acteur', ['Economique', 'Recherche', 'Institutionnel']),
        choiceCol('acteur_categorie', ['Partenaire', 'Prospect']),
        choiceCol('entreprise_activite', ['Défense', 'Conseil IT', 'Cybersécurité']),
        choiceCol('entreprise_taille', ['PME', 'ETI', 'Grand groupe'])
      ],
      Interactions: [
        choiceCol('Type', ['Réunion', 'Appel', 'Visio', 'Webinaire']),
        refCol('Partenaires', 'RefList:Structures', 'Partenaire(s)'),
        refCol('LaboratoireCluster', 'RefList:Structures', 'Laboratoire Cluster'),
        refCol('ContactPartenaire', 'RefList:Contacts', 'Contact(s) partenaire'),
        refCol('ContactCluster', 'RefList:Contacts', 'Contact(s) cluster'),
        refCol('Opportunites', 'RefList:Opportunites', 'Opportunité(s)')
      ],
      Opportunites: [
        choiceCol('Statut', ['Prospection', 'Qualification', 'Montage',
          'Contractualisation', 'Concrétisé', 'Abandonné']),
        refCol('Partenaires', 'RefList:Structures', 'Partenaire(s)'),
        refCol('EtablissementCluster', 'RefList:Structures', 'Établissement Cluster'),
        refCol('ContactPartenaire', 'RefList:Contacts', 'Contact(s) partenaire'),
        refCol('ContactCluster', 'RefList:Contacts', 'Contact(s) Cluster')
      ],
      Contacts: [refCol('Structures', 'RefList:Structures', 'Structure(s)')]
    }
  };
}

// Jeu d'essai du widget de pilotage (pilotage.html) : 12 partenaires,
// 9 équipes de recherche, 13 projets, des interactions dont certaines
// portent une prochaine échéance (c'est ce qui fait les actions).
//
// Les échéances sont calculées par rapport à aujourd'hui (`rel`) et pas
// figées : sinon les groupes "En retard / Aujourd'hui / Cette semaine"
// se videraient avec le temps, et ni les tests ni les captures ne
// montreraient plus ce qu'ils doivent montrer.
const DAY = 86400;
export function rel(days) {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000) + days * DAY;
}

// Les huit étapes cibles, pour vérifier que le Kanban lit les choix réels
// de la colonne Statut plutôt qu'une liste figée dans le widget.
export const PILOTAGE_STATUTS = ['Idée', 'Premier échange', 'Qualification', "Recherche d'équipe",
  'Montage', 'Contractualisation', 'Projet lancé', 'Terminé / abandonné'];

// Couleurs telles que le document les porterait, dans la langue de la palette
// réelle du CRM : gris → bleu → orange → jaune → vert, rouge à part.
export const PILOTAGE_STATUT_COULEURS = {
  'Idée': { fillColor: '#9ca3af', textColor: '#ffffff' },
  'Premier échange': { fillColor: '#60a5fa', textColor: '#ffffff' },
  'Qualification': { fillColor: '#3b82f6', textColor: '#ffffff' },
  "Recherche d'équipe": { fillColor: '#fb923c', textColor: '#ffffff' },
  'Montage': { fillColor: '#f97316', textColor: '#ffffff' },
  // Jaune vif : Grist enregistre bien un texte sombre.
  'Contractualisation': { fillColor: '#facc15', textColor: '#1c2321' },
  'Projet lancé': { fillColor: '#22c55e', textColor: '#ffffff' },
  'Terminé / abandonné': { fillColor: '#ef4444', textColor: '#ffffff' }
};

export function pilotageConfig() {
  // 1..12 partenaires, 101..109 équipes de recherche.
  const partners = [
    ['Sopra Steria', 'Economique', 'Partenaire', 'Conseil IT', 'ETI'],
    ['Crédit Mutuel Arkéa', 'Economique', 'Partenaire', 'Banque', 'Grand groupe'],
    ['Région Bretagne', 'Institutionnel', 'Partenaire', '', ''],
    ['Orange Innovation', 'Economique', 'Partenaire', 'Télécoms', 'Grand groupe'],
    ['Thales SIX GTS France', 'Economique', 'Partenaire', 'Défense', 'Grand groupe'],
    ['Kerlink', 'Economique', 'Partenaire', 'IoT', 'PME'],
    ['Studio Malouin Games', 'Economique', 'Partenaire', 'Jeu vidéo', 'PME'],
    ['InterDigital', 'Economique', 'Partenaire', 'R&D', 'ETI'],
    ['Zenika', 'Economique', 'Partenaire', 'Conseil IT', 'PME'],
    ['Port de Brest', 'Institutionnel', 'Partenaire', 'Portuaire', ''],
    ['Capgemini Engineering', 'Economique', 'Partenaire', 'Ingénierie', 'Grand groupe'],
    ['b<>com', 'Recherche', 'Partenaire', '', '']
  ];
  const teams = [
    ['LinkMedia', 'IRISA', 'Analyse de données multimédia'],
    ['OBELIX', 'IRISA', 'Observation de la Terre'],
    ['LACODAM', 'IRISA', 'Fouille de données'],
    ['CIDRE', 'IRISA', 'Sécurité des systèmes'],
    ['EMSEC', 'IRISA', 'Cryptographie'],
    ['SUMO', 'IRISA', 'Systèmes réactifs'],
    ['TARAN', 'IRISA', 'Architectures matérielles'],
    ['Empenn', 'IRISA / Inria', 'Neuro-imagerie'],
    ['PANAMA', 'IRISA / Inria', 'Traitement du signal']
  ];

  const structures = {
    id: partners.map((_, i) => i + 1).concat(teams.map((_, i) => 101 + i)),
    nom_acteur: partners.map(p => p[0]).concat(teams.map(t => t[0])),
    type_acteur: partners.map(p => p[1]).concat(teams.map(() => 'Recherche')),
    acteur_categorie: partners.map(p => p[2]).concat(teams.map(() => 'Partenaire')),
    entreprise_activite: partners.map(p => p[3]).concat(teams.map(() => '')),
    entreprise_taille: partners.map(p => p[4]).concat(teams.map(() => '')),
    axe_sequoia: partners.map(() => '').concat(teams.map(() => '')),
    pilier_sequoia: partners.map(() => '').concat(teams.map(() => '')),
    recherche_structure: partners.map(() => '').concat(teams.map(t => t[1])),
    // Ces deux colonnes sont ce qui distingue une équipe de recherche d'un
    // partenaire dans le widget.
    recherche_equipe_labo: partners.map(() => '').concat(teams.map(t => t[1])),
    recherche_equipe_activite: partners.map(() => '').concat(teams.map(t => t[2]))
  };

  // [sujet, type, statut, montant €, partenaire, équipes, début, échéance de dépôt,
  //  lettres de soutien attendues, reçues]
  const projets = [
    ["Extraction d'information dans les corpus juridiques", 'CIFRE', 'Idée', 0, 11, [101], rel(-24), null],
    ['VisionMer — surveillance du littoral par IA', 'ANR PRCE', 'Premier échange', 320000, 6, [102], rel(-70), rel(31), 4, 3],
    ['Personnalisation des parcours de jeu', 'Stage / projet étudiant', 'Premier échange', 0, 7, [103], rel(-40), null],
    ['LabCom Cyber-défense assistée par IA', 'LabCom', 'Qualification', 480000, 5, [104, 105], rel(-55), null],
    ['Cyber-résilience des systèmes bancaires', 'CIFRE', 'Qualification', 140000, 2, [104], rel(-30), null],
    ['TrustAI — confiance des IA distribuées', 'Projet européen', "Recherche d'équipe", 2400000, 12, [106], rel(-90), rel(48)],
    ['Chaire industrielle IA frugale', 'Chaire', 'Montage', 1200000, 4, [107, 106], rel(-120), rel(2)],
    ['Chaire Santé & IA — imagerie cérébrale', 'Chaire', 'Montage', 860000, 3, [108], rel(-100), rel(9)],
    ["Détection non supervisée d'anomalies réseau", 'CIFRE', 'Contractualisation', 135000, 1, [104], rel(-150), null],
    ['Jumeau numérique du port', 'Autre collaboration', 'Projet lancé', 210000, 10, [102], rel(-200), null],
    ['Sobriété des modèles embarqués', 'CIFRE', 'Projet lancé', 195000, 9, [107], rel(-220), null],
    ['LabCom Cyber-défense (première phase)', 'LabCom', 'Terminé / abandonné', 700000, 8, [104], rel(-75), null],
    ['POC recommandation musicale', 'Autre collaboration', 'Terminé / abandonné', 90000, 6, [109], rel(-300), null],
    // Sans partenaire : un projet interne au cluster. Le widget doit
    // l'afficher comme tel, pas comme une donnée manquante.
    ['Refonte du reporting annuel du cluster', 'Projet interne', 'Montage', 0, 0, [], rel(-15), null]
  ];

  // [date, type, objet, partenaire, contacts, prochaine échéance, suites, opportunité]
  const inters = [
    [rel(-3), 'Appel', 'Point CIFRE', 1, [201], rel(-3), 'Relancer Sopra Steria concernant le projet CIFRE', 9],
    [rel(-6), 'Réunion', 'Cadrage cyber-résilience', 2, [202], rel(0), "Envoyer 3 profils d'équipes cyber à Crédit Mutuel Arkéa", 5],
    [rel(-8), 'Visio', 'Dossier chaire Santé & IA', 3, [203], rel(0), 'Compléter le volet budgétaire du dossier chaire Santé & IA', 8],
    [rel(-12), 'Réunion', 'Chaire IA frugale', 4, [204], rel(2), 'Obtenir la grille de frais de gestion de la fondation', 7],
    [rel(-14), 'Atelier', 'Scénarios LabCom', 5, [205], rel(3), 'Préparer la note comparative des scénarios LabCom', 4],
    [rel(-14), 'Réunion', 'Cadrage LabCom', 5, [205], rel(4), 'Réunion de cadrage LabCom Thales — 14 h, campus de Beaulieu', 4],
    [rel(-20), 'Mail', 'Lettre de soutien ANR', 9, [], rel(12), 'Demander la lettre de soutien signée', null],
    [rel(-25), 'Visio', 'TrustAI — consortium', 12, [206], rel(20), 'Boucler la répartition des lots', 6],
    [rel(-33), 'Réunion', 'Jumeau numérique — comité', 10, [], null, 'Proposer un point semestriel', 10],
    // Interactions sans suite : elles n'alimentent que l'historique et le
    // "dernier contact" des partenaires.
    [rel(-41), 'Mail', 'Relance lettre de soutien', 9, [], null, '', null],
    [rel(-95), 'Réunion', "Point d'étape LabCom", 8, [], null, '', 12],
    [rel(-64), 'Appel', 'Sujet de stage M2', 7, [], null, '', 3],
    [rel(-180), 'Réunion', 'Revue annuelle', 6, [], null, '', 2]
  ];

  const contacts = {
    id: [201, 202, 203, 204, 205, 206],
    Nom: ['Faure', 'Le Goff', 'Morvan', 'Rigal', 'Lorrain', 'Peron'],
    Prenom: ['Julien', 'Anne', 'Yann', 'Claire', 'Marie', 'Luc'],
    Nom_Complet: ['Julien Faure', 'Anne Le Goff', 'Yann Morvan', 'Claire Rigal', 'Marie Lorrain', 'Luc Peron'],
    Fonction: ['Directeur R&D', 'Responsable innovation', 'Chargé de mission', 'Déléguée mécénat', 'Directrice technique', 'Chef de projet'],
    Structures: [['L', 1], ['L', 2], ['L', 3], ['L', 4], ['L', 5], ['L', 12]],
    Email: ['j.faure@soprasteria.com', 'a.legoff@arkea.com', 'y.morvan@bretagne.bzh', 'c.rigal@orange.com', 'm.lorrain@thalesgroup.com', 'l.peron@b-com.com'],
    Telephone: ['', '', '', '', '', '']
  };

  const col = (rows, i) => rows.map(r => r[i]);

  return {
    widgetTableId: 'Structures',
    baseUrl: 'https://mock.grist.local/api/docs/mockdoc',
    tables: {
      Structures: {
        colIds: ['nom_acteur', 'type_acteur', 'acteur_categorie', 'entreprise_activite',
          'entreprise_taille', 'axe_sequoia', 'pilier_sequoia', 'recherche_structure',
          'recherche_equipe_labo', 'recherche_equipe_activite'],
        data: structures
      },
      Contacts: {
        colIds: ['Nom', 'Prenom', 'Nom_Complet', 'Fonction', 'Structures', 'Email', 'Telephone'],
        data: contacts
      },
      Interactions: {
        colIds: ['Date', 'Type', 'Objet', 'Partenaires', 'ContactPartenaire', 'LaboratoireCluster',
          'ProchaineEcheance', 'Suites', 'Opportunites', 'CR'],
        data: {
          id: inters.map((_, i) => 301 + i),
          Date: col(inters, 0),
          Type: col(inters, 1),
          Objet: col(inters, 2),
          Partenaires: inters.map(r => ['L', r[3]]),
          ContactPartenaire: inters.map(r => r[4].length ? ['L'].concat(r[4]) : null),
          LaboratoireCluster: inters.map(() => null),
          ProchaineEcheance: col(inters, 5),
          Suites: col(inters, 6),
          Opportunites: inters.map(r => r[7] ? ['L', 400 + r[7]] : null),
          CR: inters.map(r => '<p>' + r[2] + ' — compte rendu.</p>')
        }
      },
      Opportunites: {
        colIds: ['Sujet', 'Type', 'Statut', 'Montant', 'Partenaires', 'EquipeCluster',
          'DateDebut', 'Echeance', 'LettresAttendues', 'LettresRecues', 'Commentaire'],
        data: {
          id: projets.map((_, i) => 401 + i),
          Sujet: col(projets, 0),
          Type: col(projets, 1),
          Statut: col(projets, 2),
          Montant: col(projets, 3),
          // partenaire 0 = projet interne (aucune structure rattachée)
          Partenaires: projets.map(r => r[4] ? ['L', r[4]] : null),
          EquipeCluster: projets.map(r => r[5].length ? ['L'].concat(r[5]) : null),
          DateDebut: col(projets, 6),
          Echeance: col(projets, 7),
          // Colonnes optionnelles : le widget les résout par leur nom, et la
          // règle « pièce manquante » s'allume dès qu'elles existent.
          LettresAttendues: projets.map(r => r[8] || null),
          LettresRecues: projets.map(r => r[9] || null),
          Commentaire: projets.map(() => '')
        }
      }
    },
    mappings: {
      Nom: 'nom_acteur', TypeActeur: 'type_acteur', Categorie: 'acteur_categorie',
      Activite: 'entreprise_activite', AxeSequoia: 'axe_sequoia', PilierSequoia: 'pilier_sequoia',
      RechercheStructure: 'recherche_structure', RechercheEquipeLabo: 'recherche_equipe_labo',
      RechercheEquipeActivite: 'recherche_equipe_activite'
    },
    columnsMeta: {
      Structures: [
        choiceCol('type_acteur', ['Economique', 'Recherche', 'Institutionnel']),
        choiceCol('acteur_categorie', ['Partenaire', 'Prospect'])
      ],
      Interactions: [
        choiceCol('Type', ['Réunion', 'Appel', 'Visio', 'Mail', 'Atelier', 'Événement']),
        refCol('Partenaires', 'RefList:Structures', 'Partenaire(s)'),
        refCol('LaboratoireCluster', 'RefList:Structures', 'Laboratoire Cluster'),
        refCol('ContactPartenaire', 'RefList:Contacts', 'Contact(s) partenaire'),
        refCol('Opportunites', 'RefList:Opportunites', 'Opportunité(s)')
      ],
      Opportunites: [
        choiceCol('Statut', PILOTAGE_STATUTS, PILOTAGE_STATUT_COULEURS),
        choiceCol('Type', ['CIFRE', 'Chaire', 'LabCom', 'ANR PRCE', 'Projet national', 'Projet européen',
          'Stage / projet étudiant', 'Projet interne', 'Autre collaboration']),
        refCol('Partenaires', 'RefList:Structures', 'Partenaire(s)'),
        refCol('EquipeCluster', 'RefList:Structures', 'Équipe Cluster')
      ],
      Contacts: [refCol('Structures', 'RefList:Structures', 'Structure(s)')]
    }
  };
}

// Le document du pilotage, complété de ce que l'Espace sait montrer en plus :
// une table d'actions avec statut, des personnes du Cluster sur les projets
// et une colonne de liens.
export function espaceConfig() {
  const cfg = pilotageConfig();
  const opp = cfg.tables.Opportunites;
  opp.colIds.push('ContactCluster', 'Liens');
  opp.data.ContactCluster = opp.data.id.map((_, i) => (i % 3 === 0 ? ['L', 201] : i % 3 === 1 ? ['L', 204, 205] : null));
  opp.data.Liens = opp.data.id.map((_, i) => (i === 1 ? 'Dossier ANR | https://drive.example.org/visionmer\nhttps://anr.fr' : ''));
  cfg.columnsMeta.Opportunites.push(refCol('ContactCluster', 'RefList:Contacts', 'Contact(s) Cluster'));
  // Des fichiers joints au projet VisionMer (colonne Pièces jointes).
  opp.colIds.push('Documents');
  opp.data.Documents = opp.data.id.map((_, i) => (i === 1 ? ['L', 801, 802] : null));
  cfg.columnsMeta.Opportunites.push({ id: 'Documents', fields: { type: 'Attachments', label: 'Documents' } });

  // [intitulé, échéance (jours), fait, statut, opportunité (401…), partenaire, contacts, important, échange]
  const acts = [
    ['Envoyer la note de cadrage', -3, false, 'À faire', 402, 6, [201], true, 301],
    ['Relancer la lettre de soutien', 1, false, 'En cours', 402, 6, [204], false, null],
    ['Préparer le comité de pilotage', 5, false, 'À faire', 407, 4, [201], false, null],
    ['Boucler la répartition des lots', 12, false, 'En cours', 406, 12, [206], true, 308],
    ['Signer l’accord de consortium', 30, false, 'En attente', 409, 1, [], false, null],
    ['Compte rendu du comité', -10, true, 'Fait', 410, 10, [201], false, null],
    ['Appeler la Région', null, false, 'À faire', null, 3, [203], false, null]
  ];
  cfg.tables.Actions_MP = {
    colIds: ['Intitule', 'Echeance', 'Fait', 'Statut', 'Opportunite', 'Partenaires', 'Contacts', 'Important', 'Interaction', 'Notes'],
    data: {
      id: acts.map((_, i) => 501 + i),
      Intitule: acts.map(a => a[0]),
      Echeance: acts.map(a => (a[1] === null ? null : rel(a[1]))),
      Fait: acts.map(a => a[2]),
      Statut: acts.map(a => a[3]),
      Opportunite: acts.map(a => (a[4] ? ['L', a[4]] : null)),
      Partenaires: acts.map(a => (a[5] ? ['L', a[5]] : null)),
      Contacts: acts.map(a => (a[6].length ? ['L'].concat(a[6]) : null)),
      Important: acts.map(a => a[7]),
      Interaction: acts.map(a => a[8]),
      Notes: acts.map(() => '')
    }
  };
  cfg.columnsMeta.Actions_MP = [
    choiceCol('Statut', ['À faire', 'En cours', 'En attente', 'Fait']),
    refCol('Opportunite', 'RefList:Opportunites', 'Opportunité'),
    refCol('Partenaires', 'RefList:Structures', 'Partenaire(s)'),
    refCol('Contacts', 'RefList:Contacts', 'Contact(s)'),
    refCol('Interaction', 'Ref:Interactions', 'Interaction')
  ];
  return cfg;
}

// Un export SIFAC fictif (CSV, séparateur « ; », en-têtes tronqués comme SIFAC
// les écrit) pour l'exercice `annee` du PFI SEQUOIA-IA. Chaque entrée :
// [flux, libellé, tiers, code tiers, compte d'exécution, étapes…] où une étape
// est [type, mois, montant] — E engagement, F facture, P paiement, R report.
export function sifacCsv(annee) {
  const entete = ['Programme de financement', 'Numéro de flux', 'Libellé du flux', 'Rubrique de la pièce', 'Nom du tiers',
    'Numéro du tiers fournisseur', 'Compte général', 'Libellé compte général', 'Date initiale', 'Montant engagé HTR',
    'Montant HTR des SF', 'Montant réceptionné non factur', 'Date comptable du CSF', 'Numéro de facture',
    'Date comptable facture', 'Texte facture', 'Montant facturé HTR', 'Montant payé', 'Date de paiement', 'Report',
    'Élément d’OTP', 'Compte d’exécution budgétaire'];
  const flux = [
    ['4500012001', 'Serveur GPU — plateforme IA', 'Dell Technologies', 'F10021', 'IG', ['E', 2, 48000], ['F', 4, 48000], ['P', 5, 48000]],
    ['4500012002', 'Licences logicielles', 'Mathworks', 'F10340', 'FG', ['E', 1, 6200], ['F', 1, 6200], ['P', 2, 6200]],
    ['4500012003', 'Organisation journée IA & sécurité', 'Traiteur Breizh', 'F20077', 'FG', ['E', 3, 3400], ['F', 3, 3350], ['P', 4, 3350]],
    ['4500012004', 'Missions conférences NeurIPS', 'Agence Voyages Campus', 'F30112', 'FG', ['E', 5, 9800], ['F', 6, 7200]],
    ['4500012005', 'Stockage données — baie NAS', 'Econocom', 'F10988', 'IG', ['E', 6, 21500]],
    ['4500012006', 'Prestation communication', 'Studio Graphique Ouest', 'F40210', 'FG', ['E', 4, 5400], ['F', 7, 5400], ['P', 8, 5400]],
    ['PAIE-2026-01', 'Salaire ingénieur de recherche', '', '', '', ['E', 1, 4300], ['P', 1, 4300]],
    ['PAIE-2026-02', 'Salaire ingénieur de recherche', '', '', '', ['E', 2, 4300], ['P', 2, 4300]],
    ['PAIE-2026-03', 'Salaire ingénieur de recherche', '', '', '', ['E', 3, 4300], ['P', 3, 4300]],
    ['PAIE-2026-04', 'Salaire post-doctorant', '', '', '', ['E', 4, 3900], ['P', 4, 3900]],
    ['PAIE-2026-05', 'Salaire post-doctorant', '', '', '', ['E', 5, 3900], ['P', 5, 3900]],
    ['4500011890', 'Écrans et postes de travail', 'Dell Technologies', 'F10021', 'IG', ['R', 1, 7800], ['F', 2, 7800], ['P', 3, 7800]]
  ];
  const d = (m) => '15/' + String(m).padStart(2, '0') + '/' + annee;
  const lignes = [entete.join(';'), 'Sous-total;;;;;;;;;123456'];
  flux.forEach(([num, lib, tiers, code, cex, ...etapes]) => {
    etapes.forEach(([type, mois, montant], i) => {
      const c = new Array(entete.length).fill('');
      c[0] = 'SEQUOIA-IA'; c[1] = num; c[2] = lib; c[4] = tiers; c[5] = code; c[6] = cex === 'IG' ? '2183' : cex === 'FG' ? '6064' : '6411';
      c[7] = cex === 'IG' ? 'Matériel informatique' : cex === 'FG' ? 'Fournitures' : 'Rémunérations'; c[20] = 'SEQ-OTP-01'; c[21] = cex;
      if (type === 'E') { c[3] = 'Commande'; c[8] = d(mois); c[9] = String(montant).replace('.', ','); }
      if (type === 'F') { c[3] = 'Facture'; c[13] = 'FA-' + num.slice(-4) + '-' + i; c[14] = d(mois); c[16] = String(montant).replace('.', ','); }
      if (type === 'P') { c[3] = 'Paiement'; c[17] = String(montant).replace('.', ','); c[18] = d(mois); }
      if (type === 'R') { c[3] = 'Report'; c[8] = '15/11/' + (annee - 1); c[19] = String(montant).replace('.', ','); }
      lignes.push(c.map(v => (/[;"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(';'));
    });
  });
  return lignes.join('\n');
}

// Le document de l'Espace avec les tables Finance déjà créées : quatre lignes
// budgétaires pour l'année en cours, et des dépenses/écritures vides (l'import
// SIFAC les remplit pendant le test).
export function espaceFinanceConfig() {
  const cfg = espaceConfig();
  const annee = new Date().getFullYear();
  const colonnes = {
    Budget_lignes: ['Libelle', 'Exercice', 'Categorie', 'Montant_prevu', 'Financeur', 'PFI', 'Notes'],
    Depenses: ['Flux', 'Libelle', 'Fournisseur', 'Code_tiers', 'Compte', 'Libelle_compte', 'Categorie', 'Statut', 'Montant',
      'Montant_engage', 'Montant_facture', 'Montant_paye', 'Date_engagement', 'Date_facture', 'Date_paiement', 'PFI', 'OTP',
      'Source', 'Orpheline', 'Budget_ligne', 'Opportunite', 'Notes'],
    Sifac_lignes: ['PFI', 'Exercice', 'Flux', 'Libelle_flux', 'Rubrique', 'Tiers', 'Code_tiers', 'Compte', 'Libelle_compte',
      'Compte_execution', 'OTP', 'Date_engagement', 'Montant_engage', 'Montant_service_fait', 'Date_service_fait', 'Num_facture',
      'Date_facture', 'Montant_facture', 'Montant_paye', 'Date_paiement', 'Report']
  };
  Object.entries(colonnes).forEach(([t, cols]) => { cfg.tables[t] = { colIds: cols, data: { id: [] } }; });
  const b = [['Personnel — ingénieur & post-doc', 'Personnel', 60000, 'ANR'], ['Équipement de calcul', 'Investissement', 70000, 'Région Bretagne'],
    ['Fonctionnement & événements', 'Fonctionnement', 18000, 'ANR'], ['Missions', 'Fonctionnement', 8000, 'ANR']];
  cfg.tables.Budget_lignes.data = {
    id: b.map((_, i) => 601 + i), Libelle: b.map(x => x[0]), Exercice: b.map(() => annee), Categorie: b.map(x => x[1]),
    Montant_prevu: b.map(x => x[2]), Financeur: b.map(x => x[3]), PFI: b.map(() => 'SEQUOIA-IA'), Notes: b.map(() => '')
  };
  // Une dépense manuelle (devis signé que SIFAC ne voit pas encore).
  cfg.tables.Depenses.data = { id: [701] };
  const manuelle = { Flux: '', Libelle: 'Devis école d’été SequoIA', Fournisseur: 'Palais du Grand Large', Categorie: 'Fonctionnement', Statut: 'Engagé',
    Montant: 2500, Montant_engage: 2500, Montant_facture: 0, Montant_paye: 0, Date_engagement: Date.UTC(annee, 6, 1) / 1000,
    PFI: 'SEQUOIA-IA', Source: 'Manuelle', Orpheline: false, Budget_ligne: 603 };
  colonnes.Depenses.forEach(c => { cfg.tables.Depenses.data[c] = [c in manuelle ? manuelle[c] : null]; });
  return cfg;
}
