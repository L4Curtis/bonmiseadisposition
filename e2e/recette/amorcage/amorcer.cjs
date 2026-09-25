#!/usr/bin/env node
'use strict';
/**
 * Amorçage du banc de recette « bmad-recette » : à lancer une fois la pile
 * démarrée (recette-up.sh le fait). Produit à chaque fois le même jeu de
 * données, décrit dans e2e/recette/GUIDE-TESTEUR.md.
 *
 * Choix : tout ce que l'application sait faire passe par son API réelle, en
 * rejouant les gestes de l'interface (création, cachet IT, envoi, signature
 * par le lien reçu dans Mailpit, restitution, PV, contestation…). Les états
 * obtenus sont donc exactement ceux que produirait un utilisateur : lignes de
 * signature scellées, PDF de preuve, journal d'audit, emails. Seuls quelques
 * gestes passent par la base, faute de route : réglage SMTP vers Mailpit,
 * création des comptes locaux, événements extérieurs (départ, mutation, lien
 * expiré ; voir lib/hors-api.cjs) et recul des dates (voir etapes/phases.cjs
 * et conteneur/decaler-temps.cjs).
 *
 * Rejouable : un banc dont l'amorçage est allé à son terme porte une marque
 * (commentaire de la base) ; il n'est pas modifié, même si les testeurs y ont
 * ajouté des bons, et le bilan est réaffiché. Un banc partiellement amorcé
 * (échec en cours de route) est refusé : il faut repartir de zéro.
 */
const path = require('node:path');
const { attendreApiPrete, ouvrirSession } = require('./lib/client-api.cjs');
const docker = require('./lib/docker.cjs');
const { PERSONNES } = require('./donnees/personnes.cjs');
const { fabriqueDeNumeros } = require('./donnees/referentiels.cjs');
const { situations } = require('./donnees/situations.cjs');
const { volume } = require('./donnees/volume.cjs');
const { creerReferentiels } = require('./etapes/referentiels.cjs');
const { creerComptes, appliquerEvenementsDeFin } = require('./lib/hors-api.cjs');
const { executerPhases, valider } = require('./etapes/phases.cjs');
const { verifierResultat } = require('./etapes/verification.cjs');
const { afficherBilan } = require('./etapes/bilan.cjs');

function journal(message) {
  process.stdout.write(`${message}\n`);
}

function construireScenarios() {
  const numero = fabriqueDeNumeros();
  return [...situations(numero), ...volume(numero)];
}

/**
 * Marque posée en commentaire de la base à la toute fin d'un amorçage réussi
 * (invisible pour l'application). Compter les bons ne suffirait pas : les
 * testeurs en créent, et un échec peut survenir une fois tous les bons créés.
 */
const MARQUE_AMORCE = 'bmad-recette : amorcage termine';

function etatDuBanc() {
  const [[marque]] = docker.requeteSql(
    `SELECT count(*) FROM pg_database WHERE datname = current_database() AND shobj_description(oid, 'pg_database') = '${MARQUE_AMORCE}';`,
  );
  if (Number(marque) === 1) return 'amorce';
  const [[comptes]] = docker.requeteSql("SELECT count(*) FROM users WHERE email LIKE '%@recette%';");
  const [[bons]] = docker.requeteSql('SELECT count(*) FROM bons;');
  return Number(comptes) === 0 && Number(bons) === 0 ? 'vierge' : 'partiel';
}

function marquerAmorce() {
  docker.executerSql(`COMMENT ON DATABASE ${docker.BASE.nom} IS '${MARQUE_AMORCE}';`);
}

function fiche(cle) {
  const p = PERSONNES.find((x) => x.cle === cle);
  return { nom: cle, email: p.email, motDePasse: p.motDePasse };
}

async function ouvrirSessionsIt() {
  return {
    admin: await ouvrirSession(fiche('admin')),
    tech1: await ouvrirSession(fiche('tech1')),
    tech2: await ouvrirSession(fiche('tech2')),
  };
}

/** Sessions des collaborateurs, ouvertes à la première signature ou contestation. */
function fabriqueSessionsCollaborateurs() {
  const ouvertes = new Map();
  return async (cle) => {
    if (!ouvertes.has(cle)) ouvertes.set(cle, await ouvrirSession(fiche(cle)));
    return ouvertes.get(cle);
  };
}

async function amorcer(scenarios) {
  const chrono = Date.now();
  journal('Amorçage : emails vers Mailpit, comptes…');
  docker.executerFichierSql(path.join(__dirname, 'smtp-mailpit.sql'));
  creerComptes();
  const sessions = await ouvrirSessionsIt();

  journal('Amorçage : filiales, catalogue, packs, comptes manuels…');
  const referentiels = await creerReferentiels(sessions.admin);
  const ctx = {
    sessions,
    ...referentiels,
    sessionCollaborateur: fabriqueSessionsCollaborateurs(),
    bons: new Map(),
    horlogeIt: new Map(),
  };

  journal(`Amorçage : ${scenarios.length} bons, en cinq phases…`);
  await executerPhases(ctx, scenarios, {
    journal,
    finDePhase: async (phase) => {
      if (phase === 'cloture') appliquerEvenementsDeFin();
    },
  });

  journal('Amorçage : vérification finale…');
  await verifierResultat(ctx, scenarios);
  marquerAmorce();
  journal(`Amorçage terminé en ${Math.round((Date.now() - chrono) / 1000)} s.`);
}

async function principal() {
  const scenarios = construireScenarios();
  valider(scenarios);
  await attendreApiPrete();
  const etat = etatDuBanc();
  if (etat === 'partiel') {
    throw new Error(
      'Banc partiellement amorcé (échec lors d\'un précédent passage). Repartez de zéro :\n' +
        '  bash e2e/recette/recette-down.sh && bash e2e/recette/recette-up.sh',
    );
  }
  if (etat === 'amorce') journal('Banc déjà amorcé : rien à ajouter.');
  else await amorcer(scenarios);
  afficherBilan(journal);
}

principal().catch((err) => {
  process.stderr.write(`\nÉCHEC DE L'AMORÇAGE : ${err.message}\n`);
  process.exitCode = 1;
});
