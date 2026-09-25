'use strict';
/**
 * Étape 1 de l'amorçage : filiales, catalogue, packs et comptes.
 * Tout passe par l'API réelle (session admin, voir lib/actions.cjs), sauf les
 * comptes locaux et « annuaire » que l'application ne sait pas créer (voir
 * lib/hors-api.cjs).
 */
const A = require('../lib/actions.cjs');
const { FILIALES, FILIALE_INACTIVE, ARTICLES, ARTICLE_RETIRE, PACKS } = require('../donnees/referentiels.cjs');
const { PERSONNES } = require('../donnees/personnes.cjs');
const { logoPng, cachetPng } = require('../lib/png.cjs');
const { requeteSql } = require('../lib/docker.cjs');
const { rattacherComptes } = require('../lib/hors-api.cjs');

async function creerFiliales(admin) {
  const ids = {};
  for (const f of FILIALES) {
    ids[f.cle] = await A.creerFiliale(admin, f, { logo: logoPng(f.couleur), cachet: cachetPng(f.couleur) });
  }
  await A.desactiverFiliale(admin, await A.creerFiliale(admin, FILIALE_INACTIVE));
  return ids;
}

async function creerCatalogue(admin) {
  const ids = {};
  for (const a of ARTICLES) ids[a.cle] = await A.creerArticle(admin, a);
  await A.retirerArticle(admin, await A.creerArticle(admin, ARTICLE_RETIRE));
  return ids;
}

async function creerPacks(admin, articles) {
  const ids = {};
  for (const p of PACKS) ids[p.cle] = await A.creerPack(admin, p, p.articles.map((cle) => articles[cle]));
  return ids;
}

/** Comptes manuels (compagnons de chantier sans adresse) : par l'API, comme le ferait l'IT. */
async function creerComptesManuels(admin, filiales) {
  const ids = {};
  for (const p of PERSONNES.filter((x) => x.compte === 'manuel')) {
    ids[p.cle] = await A.creerCompteManuel(admin, p, filiales[p.filiale]);
  }
  return ids;
}

/** Identifiants des personnes : par login pour les comptes créés en SQL, par la réponse de l'API pour les manuels. */
function lirePersonnes(idsManuels) {
  const lignes = requeteSql("SELECT id, sam_account_name FROM users WHERE email LIKE '%@recette%';");
  const fiches = {};
  for (const p of PERSONNES) {
    const id = p.compte === 'manuel' ? idsManuels[p.cle] : lignes.find(([, sam]) => sam === p.sam)?.[0];
    if (!id) throw new Error(`Compte introuvable après création : ${p.nom}`);
    fiches[p.cle] = { ...p, id };
  }
  return fiches;
}

async function creerReferentiels(admin) {
  const filiales = await creerFiliales(admin);
  const articles = await creerCatalogue(admin);
  const packs = await creerPacks(admin, articles);
  rattacherComptes();
  const idsManuels = await creerComptesManuels(admin, filiales);
  return { filiales, articles, packs, personnes: lirePersonnes(idsManuels) };
}

module.exports = { creerReferentiels };
