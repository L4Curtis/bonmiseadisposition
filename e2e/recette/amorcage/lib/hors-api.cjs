'use strict';
/**
 * Les gestes que l'amorçage fait directement en base, faute de route dans
 * l'application : création des comptes locaux et « annuaire », rattachement à
 * leur filiale, événements extérieurs (départ d'un salarié, mutation) et lien
 * de signature laissé expirer. Ils simulent un annuaire, le temps qui passe ou
 * un événement extérieur, jamais un geste d'utilisateur. Le réglage SMTP est
 * dans smtp-mailpit.sql, le recul des dates dans conteneur/decaler-temps.cjs.
 *
 * Si le schéma des tables `users` ou `signatures` change, c'est ici qu'il
 * faut l'adapter. Aucune donnée extérieure n'entre dans ces requêtes : les
 * constantes de donnees/personnes.cjs passent par litteral(), les
 * identifiants sont contrôlés.
 */
const { executerSql, requeteSql } = require('./docker.cjs');
const { PERSONNES, EMPREINTES } = require('../donnees/personnes.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES_DE_LIEN = new Set(['mise_disposition', 'restitution', 'pv_cloture']);

/** Littéral SQL d'une constante de donnees/personnes.cjs. */
function litteral(valeur) {
  if (valeur === null || valeur === undefined) return 'NULL';
  if (typeof valeur === 'boolean') return valeur ? 'true' : 'false';
  return `'${String(valeur).replace(/'/g, "''")}'`;
}

function ligneCompte(p) {
  const local = p.compte === 'local';
  const estIt = p.role === 'admin' || p.role === 'technician';
  return `(gen_random_uuid()::text, ${litteral(p.sam)}, ${litteral(p.nom)}, ${litteral(p.email)}, ` +
    `${litteral(p.departement)}, ${litteral(p.fonction)}, NULL, ` +
    `${litteral(p.role)}, ${litteral(estIt)}, true, ${litteral(local)}, false, false, ` +
    `${local ? litteral(EMPREINTES[p.motDePasse]) : 'NULL'}, ${local ? 'now()' : 'NULL'}, ${local ? 'NULL' : 'now()'}, now(), now())`;
}

/**
 * Comptes « local » et « annuaire » (les comptes manuels passent par l'API).
 * Créés AVANT les filiales, puisqu'il faut un admin pour les créer : le
 * rattachement suit, voir rattacherComptes(). Rejouable : ON CONFLICT sur le login.
 */
function creerComptes() {
  const lignes = PERSONNES.filter((p) => p.compte !== 'manuel').map(ligneCompte);
  executerSql(`INSERT INTO users (
  id, sam_account_name, display_name, email, department, title, filiale_id, role,
  is_it_staff, active, is_local_account, is_manual_account, must_change_password,
  password_hash, password_changed_at, last_ldap_sync, created_at, updated_at
) VALUES
${lignes.join(',\n')}
ON CONFLICT (sam_account_name) DO NOTHING;`);
}

/** Rattachement de chaque compte (hors manuels) à sa filiale, une fois les filiales créées. */
function rattacherComptes() {
  const lignes = PERSONNES.filter((p) => p.compte !== 'manuel').map(
    (p) => `UPDATE users SET filiale_id = (SELECT id FROM filiales WHERE name = ${litteral(p.filiale)}) WHERE sam_account_name = ${litteral(p.sam)};`,
  );
  executerSql(['BEGIN;', ...lignes, 'COMMIT;'].join('\n'));
}

/** Fin d'amorçage : départ de Paul (compte désactivé), mutation de Sophie. */
function appliquerEvenementsDeFin() {
  const departs = PERSONNES.filter((p) => p.desactiveEnFin)
    .map((p) => `UPDATE users SET active = false, updated_at = now() WHERE sam_account_name = ${litteral(p.sam)};`);
  const mutations = PERSONNES.filter((p) => p.nouvelleFiliale)
    .map((p) => `UPDATE users SET filiale_id = (SELECT id FROM filiales WHERE name = ${litteral(p.nouvelleFiliale)}), updated_at = now() WHERE sam_account_name = ${litteral(p.sam)};`);
  executerSql(['BEGIN;', ...departs, ...mutations, 'COMMIT;'].join('\n'));
}

/**
 * Fait expirer le lien de signature en attente (échéance passée d'une heure),
 * comme s'il n'avait pas été utilisé à temps. L'échéance n'entre pas dans le
 * sceau d'une signature : rien d'autre n'est à recalculer.
 */
async function expirerLienEnAttente(_ctx, bon, type) {
  if (!UUID.test(bon.id) || !TYPES_DE_LIEN.has(type)) throw new Error(`Paramètres invalides : ${bon.id} / ${type}`);
  const lignes = requeteSql(
    `UPDATE signatures SET token_expires_at = now() - interval '1 hour'
     WHERE bon_id = '${bon.id}' AND type = '${type}' AND signed = false AND token_expires_at > now()
     RETURNING id;`,
  );
  if (lignes.length !== 1) throw new Error(`${bon.reference} : ${lignes.length} lien(s) « ${type} » en attente au lieu d'un seul`);
}

module.exports = { creerComptes, rattacherComptes, appliquerEvenementsDeFin, expirerLienEnAttente };
