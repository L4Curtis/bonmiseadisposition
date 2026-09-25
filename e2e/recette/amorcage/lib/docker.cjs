'use strict';
/**
 * Accès aux conteneurs du banc (projet compose « bmad-recette » uniquement) :
 * SQL dans le conteneur Postgres, scripts Node dans le conteneur backend.
 *
 * Node lance docker.exe directement (pas de shell) : les chemins passés en
 * argument ne subissent donc pas la conversion de chemins de Git Bash.
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Projet et base fixes, sans variable d'environnement : l'amorçage écrit, il
// ne doit jamais pouvoir viser la base de développement ni la pile E2E.
const PROJET = 'bmad-recette';
const FICHIER_COMPOSE = path.resolve(__dirname, '..', '..', 'docker-compose.recette.yml');
const BASE = { utilisateur: 'recette', nom: 'bons_disposition_recette' };
/** Assez large pour un script de décalage sur quelques dizaines de bons. */
const TAILLE_SORTIE_MAX = 64 * 1024 * 1024;

function compose(args, options = {}) {
  return execFileSync('docker', ['compose', '-p', PROJET, '-f', FICHIER_COMPOSE, ...args], {
    encoding: 'utf8',
    maxBuffer: TAILLE_SORTIE_MAX,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
}

/** Exécute un script SQL complet (arrêt à la première erreur, transaction à la charge du script). */
function executerSql(texte) {
  return compose(
    ['exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', BASE.utilisateur, '-d', BASE.nom],
    { input: texte },
  );
}

function executerFichierSql(fichier) {
  return executerSql(readFileSync(fichier, 'utf8'));
}

/**
 * Exécute une requête SQL et rend les lignes (colonnes séparées par « | »).
 * Réservé à des requêtes écrites dans ce dossier : aucune donnée extérieure
 * n'y est jamais concaténée.
 */
function requeteSql(sql) {
  const sortie = compose(
    ['exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-F', '|', '-U', BASE.utilisateur, '-d', BASE.nom],
    { input: sql },
  );
  return sortie.split(/\r?\n/).filter((ligne) => ligne.length > 0).map((ligne) => ligne.split('|'));
}

/** Heure de la base (même horloge que le backend : même machine virtuelle Docker), en ISO UTC. */
function heureBase() {
  const [[iso]] = requeteSql(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');`);
  return iso;
}

/**
 * Exécute un script Node DANS le conteneur backend, avec le code compilé de
 * l'application (Prisma, scellement des signatures). Les paramètres passent
 * par une variable d'environnement encodée en base64 (aucun souci de
 * guillemets sous Windows). Le script écrit son résultat sur une ligne
 * « RESULTAT {json} ».
 */
function scriptBackend(fichierScript, parametres) {
  const encodes = Buffer.from(JSON.stringify(parametres), 'utf8').toString('base64');
  let sortie;
  try {
    sortie = compose(['exec', '-T', '-e', `RECETTE_PARAMETRES=${encodes}`, 'backend', 'node', '-'], {
      input: readFileSync(fichierScript, 'utf8'),
    });
  } catch (err) {
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Échec du script ${path.basename(fichierScript)} dans le conteneur backend :\n${detail}`);
  }
  const ligne = sortie.split(/\r?\n/).find((l) => l.startsWith('RESULTAT '));
  if (!ligne) throw new Error(`Le script ${path.basename(fichierScript)} n'a rendu aucun résultat :\n${sortie}`);
  return JSON.parse(ligne.slice('RESULTAT '.length));
}

module.exports = { PROJET, FICHIER_COMPOSE, BASE, executerSql, executerFichierSql, requeteSql, heureBase, scriptBackend };
