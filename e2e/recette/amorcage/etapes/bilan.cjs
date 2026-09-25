'use strict';
/**
 * Affichage final : adresses du banc, comptes par rôle et bon à ouvrir pour
 * chaque situation (lu en base, donc toujours exact).
 */
const { requeteSql } = require('../lib/docker.cjs');
const { BASE_URL } = require('../lib/client-api.cjs');
const { MAILPIT_URL } = require('../lib/mailpit.cjs');
const { PERSONNES } = require('../donnees/personnes.cjs');

const LIBELLES_ROLE = { admin: 'Admin', technician: 'Technicien', direction: 'Direction', collaborator: 'Collaborateur' };

function colonnes(lignes) {
  const largeurs = lignes[0].map((_, i) => Math.max(...lignes.map((l) => String(l[i]).length)));
  return lignes.map((l) => l.map((c, i) => String(c).padEnd(largeurs[i])).join('  ').trimEnd());
}

function tableauComptes() {
  const connectables = PERSONNES.filter((p) => p.compte === 'local' || p.cas);
  const lignes = [['Rôle', 'Nom', 'Identifiant (email)', 'Mot de passe', 'Particularité']].concat(
    connectables.map((p) => [
      LIBELLES_ROLE[p.role],
      p.nom,
      p.email ?? '(aucune adresse)',
      p.motDePasse ?? '(ne se connecte pas)',
      p.cas ?? '',
    ]),
  );
  return colonnes(lignes);
}

function tableauSituations() {
  const lignes = requeteSql(
    "SELECT reference, status::text, substring(notes from 'Recette (S[0-9]+)'), substring(notes from 'Recette S[0-9]+ : (.*)\\.$') " +
      "FROM bons WHERE notes LIKE 'Recette S%' ORDER BY reference;",
  );
  return colonnes([['Situation', 'Référence', 'Statut', 'Description']].concat(lignes.map(([ref, statut, cle, texte]) => [cle, ref, statut, texte])));
}

function afficherBilan(journal) {
  const [[total]] = requeteSql('SELECT count(*) FROM bons;');
  const [[emails]] = requeteSql('SELECT count(*) FROM notification_logs;');
  journal('');
  journal('════════════════════════ Banc de recette prêt ════════════════════════');
  journal(`Application : ${BASE_URL}   (connexion : « Connexion avec un compte local »)`);
  journal(`Mailpit     : ${MAILPIT_URL}   (API : ${MAILPIT_URL}/api/v1/messages)`);
  journal(`Bons        : ${total}   Emails journalisés : ${emails}`);
  journal('');
  journal('Comptes :');
  for (const ligne of tableauComptes()) journal(`  ${ligne}`);
  journal('');
  journal('Situations (bon à ouvrir) :');
  for (const ligne of tableauSituations()) journal(`  ${ligne}`);
  journal('');
  journal('Guide complet : e2e/recette/GUIDE-TESTEUR.md');
}

module.exports = { afficherBilan };
