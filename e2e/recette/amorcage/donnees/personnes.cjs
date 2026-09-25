'use strict';
/**
 * Toutes les personnes du banc de recette — source unique : comptes créés
 * (lib/hors-api.cjs pour les comptes locaux et « annuaire », l'API pour les
 * comptes manuels), sessions de l'amorçage, gabarit des testeurs et tableau
 * des comptes affiché en fin d'amorçage.
 *
 * Types de compte :
 *   - « local »    : compte local avec mot de passe, peut se connecter ;
 *   - « annuaire » : compte tel que l'aurait importé la synchronisation
 *                    Active Directory (pas de mot de passe : sans annuaire ni
 *                    Entra sur ce banc, il ne se connecte pas) ;
 *   - « manuel »   : compte manuel créé par l'API (POST /users/manual), le cas
 *                    des compagnons de chantier sans adresse email.
 *
 * Mots de passe de recette : valeurs FACTICES, propres à ce banc jetable.
 * Empreintes bcrypt (coût 10) calculées avec la bibliothèque du backend :
 *   node -e "console.log(require('bcryptjs').hashSync('Recette-Admin#2026', 10))"
 */

const MOTS_DE_PASSE = {
  admin: 'Recette-Admin#2026',
  technicien: 'Recette-Tech#2026',
  direction: 'Recette-Direction#2026',
  collaborateur: 'Recette-Collab#2026',
};

const EMPREINTES = {
  'Recette-Admin#2026': '$2a$10$WrcuHIEDxgEd7LBjdPylveSZOvu2xZRSBWP5Hmkcud0/8PE6nsQI2',
  'Recette-Tech#2026': '$2a$10$DnQaiP.FBGKdZSwVNDbXNuUKkmSujVLAnvIFp1.1os99UsVU9OPsO',
  'Recette-Direction#2026': '$2a$10$DQncV6zdeYyxbsxwjFFQMewWTw03smdwqw/4CSNjNNHBJFYChoHN6',
  'Recette-Collab#2026': '$2a$10$1HOIz2nw1cZxW9g28ZGyCeAYTegQPwluosK2jWgZNHV/1Xtq3FFVO',
};

/** Fabrique une fiche, en figeant ses champs (données de référence). */
function personne(cle, sam, nom, civilite, filiale, role, compte, email, departement, fonction, extra = {}) {
  const motDePasse =
    compte !== 'local' ? null
    : role === 'admin' ? MOTS_DE_PASSE.admin
    : role === 'technician' ? MOTS_DE_PASSE.technicien
    : role === 'direction' ? MOTS_DE_PASSE.direction
    : MOTS_DE_PASSE.collaborateur;
  return Object.freeze({ cle, sam, nom, civilite, filiale, role, compte, email, departement, fonction, motDePasse, ...extra });
}

const PERSONNES = Object.freeze([
  // ── Service informatique et direction ──────────────────────────────────
  personne('admin', 'n.lefevre', 'Nadia Lefèvre', 'mme', 'NORD', 'admin', 'local', 'nadia.lefevre@recette.test', 'Service informatique', 'Responsable informatique'),
  personne('tech1', 't.girard', 'Thomas Girard', 'mr', 'NORD', 'technician', 'local', 'thomas.girard@recette.test', 'Service informatique', 'Technicien support'),
  personne('tech2', 'j.moreau', 'Julie Moreau', 'mme', 'SUD', 'technician', 'local', 'julie.moreau@recette.test', 'Service informatique', 'Technicienne support'),
  personne('direction', 'm.dubois', 'Marc Dubois', 'mr', 'NORD', 'direction', 'local', 'marc.dubois@recette.test', 'Direction générale', 'Directeur des opérations'),

  // ── Collaborateurs nommés (un cas de test chacun) ──────────────────────
  personne('lea', 'l.martin', 'Léa Martin', 'mme', 'NORD', 'collaborator', 'local', 'lea.martin@recette.test', 'Conduite de travaux', 'Conductrice de travaux',
    { cas: 'Adresse valide : ses emails arrivent dans Mailpit, portail bien rempli' }),
  personne('ahmed', null, 'Ahmed Benali', 'mr', 'SUD', 'collaborator', 'manuel', null, 'Chantier', 'Compagnon',
    { prenom: 'Ahmed', nomFamille: 'Benali', cas: 'Sans adresse (compagnon de chantier) : présentiel uniquement, ne se connecte pas' }),
  personne('karim', 'k.haddad', 'Karim Haddad', 'mr', 'NORD', 'collaborator', 'local', 'karim.haddad@recette', 'Études', 'Dessinateur-projeteur',
    { cas: 'Adresse invalide (domaine sans point) : se connecte, mais aucun lien ne peut lui être envoyé' }),
  personne('paul', 'p.rousseau', 'Paul Rousseau', 'mr', 'NORD', 'collaborator', 'local', 'paul.rousseau@recette.test', 'Chantiers', 'Chef de chantier',
    { desactiveEnFin: true, cas: 'Parti (compte désactivé en fin d\'amorçage) : détient encore du matériel, ne se connecte plus' }),
  personne('sophie', 's.bernard', 'Sophie Bernard', 'mme', 'SUD', 'collaborator', 'local', 'sophie.bernard@recette.test', 'Administration des ventes', 'Assistante commerciale',
    { nouvelleFiliale: 'EST', cas: 'A changé de filiale (Sud → Est) : ses bons restent sur la filiale Sud' }),
  personne('hugo', 'h.petit', 'Hugo Petit', 'mr', 'EST', 'collaborator', 'local', 'hugo.petit@recette.test', 'Maintenance', 'Technicien de maintenance',
    { cas: 'Adresse valide : signe à distance, conteste, a un PV à signer' }),

  // ── Figurants (volume des listes et du tableau de bord) ────────────────
  personne('mathis', null, 'Mathis Lopez', 'mr', 'EST', 'collaborator', 'manuel', null, 'Chantier', 'Compagnon', { prenom: 'Mathis', nomFamille: 'Lopez' }),
  personne('camille', 'c.laurent', 'Camille Laurent', 'mme', 'NORD', 'collaborator', 'annuaire', 'camille.laurent@recette.test', 'Comptabilité', 'Comptable'),
  personne('nicolas', 'n.simon', 'Nicolas Simon', 'mr', 'NORD', 'collaborator', 'annuaire', 'nicolas.simon@recette.test', 'Chantiers', 'Conducteur de travaux'),
  personne('emilie', 'e.michel', 'Émilie Michel', 'mme', 'NORD', 'collaborator', 'annuaire', 'emilie.michel@recette.test', 'Ressources humaines', 'Chargée RH'),
  personne('julien', 'j.lefebvre', 'Julien Lefebvre', 'mr', 'NORD', 'collaborator', 'annuaire', 'julien.lefebvre@recette.test', 'Études', 'Ingénieur études'),
  personne('chloe', 'c.garcia', 'Chloé Garcia', 'mme', 'NORD', 'collaborator', 'annuaire', 'chloe.garcia@recette.test', 'Achats', 'Acheteuse'),
  personne('antoine', 'a.david', 'Antoine David', 'mr', 'NORD', 'collaborator', 'annuaire', 'antoine.david@recette.test', 'Chantiers', 'Chef d\'équipe'),
  personne('manon', 'm.bertrand', 'Manon Bertrand', 'mme', 'SUD', 'collaborator', 'annuaire', 'manon.bertrand@recette.test', 'Administration des ventes', 'Chargée de clientèle'),
  personne('lucas', 'l.roux', 'Lucas Roux', 'mr', 'SUD', 'collaborator', 'annuaire', 'lucas.roux@recette.test', 'Chantiers', 'Chef de chantier'),
  personne('sarah', 's.vincent', 'Sarah Vincent', 'mme', 'SUD', 'collaborator', 'annuaire', 'sarah.vincent@recette.test', 'Qualité', 'Responsable qualité'),
  personne('maxime', 'm.fournier', 'Maxime Fournier', 'mr', 'SUD', 'collaborator', 'annuaire', 'maxime.fournier@recette.test', 'Logistique', 'Magasinier'),
  personne('ines', 'i.morel', 'Inès Morel', 'mme', 'SUD', 'collaborator', 'annuaire', 'ines.morel@recette.test', 'Comptabilité', 'Assistante comptable'),
  personne('theo', 't.lambert', 'Théo Lambert', 'mr', 'EST', 'collaborator', 'annuaire', 'theo.lambert@recette.test', 'Maintenance', 'Électricien'),
  personne('clara', 'c.fontaine', 'Clara Fontaine', 'mme', 'EST', 'collaborator', 'annuaire', 'clara.fontaine@recette.test', 'Direction', 'Assistante de direction'),
  personne('romain', 'r.mercier', 'Romain Mercier', 'mr', 'EST', 'collaborator', 'annuaire', 'romain.mercier@recette.test', 'Bureau d\'études', 'Projeteur'),
  personne('zoe', 'z.blanc', 'Zoé Blanc', 'mme', 'EST', 'collaborator', 'annuaire', 'zoe.blanc@recette.test', 'Ressources humaines', 'Gestionnaire paie'),
  personne('nathan', 'n.guerin', 'Nathan Guerin', 'mr', 'EST', 'collaborator', 'annuaire', 'nathan.guerin@recette.test', 'Chantiers', 'Chef de chantier'),
]);

module.exports = { PERSONNES, MOTS_DE_PASSE, EMPREINTES };
