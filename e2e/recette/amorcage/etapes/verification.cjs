'use strict';
/**
 * Contrôle final de l'amorçage, par l'API : chaque bon a le statut annoncé,
 * chaque situation nommée porte la référence annoncée dans GUIDE-TESTEUR.md,
 * et l'application juge intactes toutes les signatures (sceaux recalculés
 * après le recul des dates). Un écart fait échouer l'amorçage : un guide qui
 * mentirait aux testeurs serait pire qu'un banc absent.
 */
const { integriteDuBon, relireBon } = require('../lib/actions.cjs');
const { requeteSql } = require('../lib/docker.cjs');
const { PERSONNES } = require('../donnees/personnes.cjs');

function numeroAttendu(index) {
  return `-${String(index + 1).padStart(4, '0')}`;
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
