'use strict';
/**
 * Contrôle final de l'amorçage, par l'API : chaque bon a le statut annoncé,
 * chaque situation nommée porte la référence annoncée dans GUIDE-TESTEUR.md,
 * et l'application juge intactes toutes les signatures (sceaux recalculés
 * après le recul des dates). Un écart fait échouer l'amorçage : un guide qui
 * mentirait aux testeurs serait pire qu'un banc absent.
 */
const { contestationsATraiter, integriteDuBon, relireBon } = require('../lib/actions.cjs');
const { requeteSql } = require('../lib/docker.cjs');
const { PERSONNES } = require('../donnees/personnes.cjs');

function numeroAttendu(index) {
  return `-${String(index + 1).padStart(4, '0')}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIANT = /^[a-z_]+$/;

/** Valeur unique d'une requête de lecture ('' si aucune ligne). */
function valeur(sql) {
  const lignes = requeteSql(sql);
  return lignes.length > 0 ? lignes[0][0] : '';
}

/** Contestation de l'amorçage : document contesté et issue (null : pas encore tranchée). */
function controlerContestation(bonId, { document, issue }) {
  const [ligne] = requeteSql(
    `SELECT contested_document::text, coalesce(outcome::text, '') FROM contestations WHERE bon_id = '${bonId}' ORDER BY created_at DESC LIMIT 1;`,
  );
  if (!ligne) return ['aucune contestation'];
  const ecarts = [];
  if (ligne[0] !== document) ecarts.push(`document contesté ${ligne[0]}, attendu ${document}`);
  if (ligne[1] !== (issue ?? '')) ecarts.push(`issue « ${ligne[1]} », attendue « ${issue ?? ''} »`);
  return ecarts;
}

/** Bon remplaçant : brouillon lié à l'original. */
function controlerRemplacant(bonId) {
  const statut = valeur(`SELECT status::text FROM bons WHERE replaces_bon_id = '${bonId}';`);
  return statut === 'draft' ? [] : [`bon remplaçant ${statut ? `au statut ${statut}` : 'absent'}, brouillon attendu`];
}

/**
 * Écarts d'une situation par rapport à ses attendus (donnees/situations.cjs,
 * champ `attendu`), lus en base : document sans signature, contestation au
 * format de la vague 2, lien invalidé avec son motif, remplaçant, demande de
 * nouveau lien, civilité retenue sur le compte.
 */
function controlerAttendus(bonId, attendu) {
  if (!UUID.test(bonId)) throw new Error(`Identifiant de bon inattendu : ${bonId}`);
  const ecarts = [];
  for (const type of attendu.documents ?? []) {
    if (!IDENTIFIANT.test(type)) throw new Error(`Type de document inattendu : ${type}`);
    if (valeur(`SELECT count(*) FROM pdf_snapshots WHERE bon_id = '${bonId}' AND type::text = '${type}';`) !== '1') {
      ecarts.push(`document ${type} absent`);
    }
  }
  if (attendu.contestation) ecarts.push(...controlerContestation(bonId, attendu.contestation));
  if (attendu.remplacant) ecarts.push(...controlerRemplacant(bonId));
  if (attendu.lienInvalide) {
    const { type, motif } = attendu.lienInvalide;
    if (!IDENTIFIANT.test(type) || !IDENTIFIANT.test(motif)) throw new Error(`Lien attendu invalide : ${type}/${motif}`);
    const n = valeur(`SELECT count(*) FROM signatures WHERE bon_id = '${bonId}' AND type::text = '${type}' AND invalidated_reason::text = '${motif}' AND invalidated_at IS NOT NULL;`);
    if (n === '0') ecarts.push(`aucun lien ${type} invalidé pour le motif ${motif}`);
  }
  if (attendu.lienRedemande
    && valeur(`SELECT count(*) FROM audit_logs WHERE bon_id = '${bonId}' AND action = 'signature_link_requested';`) === '0') {
    ecarts.push('aucune demande de nouveau lien');
  }
  if (attendu.civilite) {
    const { collaborateur, valeur: civilite } = attendu.civilite;
    const sam = PERSONNES.find((p) => p.cle === collaborateur).sam;
    const lue = valeur(`SELECT coalesce(civilite::text, '') FROM users WHERE sam_account_name = '${sam}';`);
    if (lue !== civilite) ecarts.push(`civilité du compte « ${lue} », attendue « ${civilite} »`);
  }
  return ecarts;
}

/** Contestation en retard selon l'application (jours ouvrés), comme la tuile et la relance. */
async function controlerRetardContestation(ctx, bonId) {
  const { contestations, overdueSince } = await contestationsATraiter(ctx);
  const contestation = contestations.find((c) => c.bonId === bonId);
  if (!contestation) return ['contestation absente de la liste « À traiter »'];
  return new Date(contestation.createdAt) <= new Date(overdueSince) ? [] : ['contestation pas encore en retard'];
}

async function verifierBons(ctx, scenarios) {
  const ecarts = [];
  for (const [index, s] of scenarios.entries()) {
    const { id } = ctx.bons.get(s.cle);
    const bon = await relireBon(ctx, id);
    if (bon.status !== s.statut) ecarts.push(`${s.cle} ${bon.reference} : statut ${bon.status}, attendu ${s.statut}`);
    if (s.cle.startsWith('S') && !bon.reference.endsWith(numeroAttendu(index))) {
      ecarts.push(`${s.cle} : référence ${bon.reference}, attendue …${numeroAttendu(index)}`);
    }
    const integrite = await integriteDuBon(ctx, id);
    if (!integrite.allValid) ecarts.push(`${s.cle} ${bon.reference} : signatures jugées altérées par l'application`);
    const propres = controlerAttendus(id, s.attendu ?? {});
    if (s.attendu?.contestationEnRetard) propres.push(...(await controlerRetardContestation(ctx, id)));
    for (const ecart of propres) ecarts.push(`${s.cle} ${bon.reference} : ${ecart}`);
  }
  return ecarts;
}

function verifierComptes() {
  const ecarts = [];
  for (const p of PERSONNES.filter((x) => x.desactiveEnFin || x.nouvelleFiliale)) {
    const [[actif, filiale]] = requeteSql(
      `SELECT u.active, f.name FROM users u LEFT JOIN filiales f ON f.id = u.filiale_id WHERE u.sam_account_name = '${p.sam}';`,
    );
    if (p.desactiveEnFin && actif !== 'f') ecarts.push(`${p.nom} devrait être désactivé`);
    if (p.nouvelleFiliale && filiale !== p.nouvelleFiliale) ecarts.push(`${p.nom} devrait être rattachée à ${p.nouvelleFiliale}`);
  }
  return ecarts;
}

async function verifierResultat(ctx, scenarios) {
  const ecarts = [...(await verifierBons(ctx, scenarios)), ...verifierComptes()];
  if (ecarts.length > 0) throw new Error(`Le banc ne correspond pas au guide :\n  - ${ecarts.join('\n  - ')}`);
}

module.exports = { verifierResultat };
