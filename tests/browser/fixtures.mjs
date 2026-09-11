// Jeux de données partagés entre la suite de tests et l'aperçu visuel
// (tests/browser/screenshot.mjs) — un seul endroit à mettre à jour quand le
// document Grist évolue.

export function choiceCol(id, choices) {
  return { id, fields: { type: 'Choice', widgetOptions: JSON.stringify({ choices }) } };
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
          id: [1, 2, 3],
          nom_acteur: ['Thales', 'Zenika', 'Inria Rennes'],
          description: ['Groupe de défense et aéronautique', '', ''],
          type_acteur: ['Economique', 'Economique', 'Recherche'],
          acteur_categorie: ['Partenaire', 'Prospect', 'Partenaire'],
          entreprise_activite: ['Défense', 'Conseil IT', ''],
          entreprise_taille: ['Grand groupe', 'PME', ''],
          axe_sequoia: ['IA de confiance', '', ''],
          pilier_sequoia: ['IA & sécurité', '', 'IA fondamentale'],
          url_site_web: ['https://www.thalesgroup.com', '', ''],
          url_logo: ['', '', ''],
          recherche_structure: ['', '', 'Inria'],
          recherche_equipe_activite: ['', '', ''],
          recherche_equipe_labo: ['', '', '']
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
        colIds: ['Date', 'Type', 'Partenaires', 'Objet', 'ContactPartenaire', 'ProchaineEcheance',
          'Suites', 'Opportunites', 'CR', 'PJ'],
        data: {
          id: [20, 21, 22],
          Date: [D(2026, 3, 14), D(2026, 1, 28), D(2025, 12, 9)],
          Type: ['Réunion', 'Appel', 'Atelier'],
          Partenaires: [['L', 1], ['L', 1], ['L', 2]],
          Objet: ['Revue annuelle du partenariat', 'Calage du budget', 'Atelier sécurité'],
          ContactPartenaire: [['L', 10, 11], ['L', 11], ['L', 12]],
          // Far enough out that "prochaine action" stays in the future whenever
          // the suite runs.
          ProchaineEcheance: [D(2030, 3, 1), null, null],
          Suites: ['Envoyer la note de cadrage', '', ''],
          Opportunites: [null, null, null],
          CR: ['<p>Thales confirme son intérêt pour la chaire IA de confiance.</p>', '<p>Budget prévisionnel calé.</p>', ''],
          PJ: [['L', 501], null, null]
        }
      },
      Opportunites: {
        colIds: ['Sujet', 'Type', 'Partenaires', 'AxeSequoia', 'Statut', 'DateDebut', 'Echeance',
          'Montant', 'Commentaire', 'ContactPartenaire', 'ContactCluster'],
        data: {
          id: [30, 31, 32],
          Sujet: ['Chaire IA de confiance', 'POC détection d\'intrusion', 'Vieux projet'],
          Type: ['Chaire', 'POC', 'POC'],
          Partenaires: [['L', 1], ['L', 1], ['L', 1]],
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
      Interactions: [choiceCol('Type', ['Réunion', 'Appel', 'Visio', 'Webinaire'])],
      Opportunites: [choiceCol('Statut', ['Prospection', 'Qualification', 'Montage',
        'Contractualisation', 'Concrétisé', 'Abandonné'])]
    }
  };
}
