'use strict';
/**
 * Client HTTP de l'amorçage : parle à l'API réelle À TRAVERS le nginx du
 * frontend (http://localhost:8082/api), exactement comme le navigateur.
 *
 * - Session par compte (cookies access_token / refresh_token posés par
 *   /auth/local-login), reconnexion automatique si l'accès expire.
 * - En-tête X-Requested-With sur toute écriture (protection CSRF du backend).
 * - Une adresse client différente à chaque requête (en-tête CF-Connecting-IP) :
 *   l'amorçage enchaîne plusieurs centaines d'appels en quelques minutes, ce
 *   que les plafonds par adresse du backend refuseraient à un seul poste.
 *
 * Adresse du banc fixe, sans variable d'environnement : l'amorçage écrit, il
 * ne doit jamais pouvoir viser l'API de développement ni la pile E2E.
 */

const BASE_URL = 'http://localhost:8082';
const RAPPEL_ADAPTATION =
  "L'API a-t-elle changé ? Adapter e2e/recette/amorcage/lib/actions.cjs (client-api.cjs pour la connexion).";

let compteurAdresses = 0;
/** Adresses 10.200.0.2 → 10.200.255.250 (64 000), jamais deux fois la même dans un amorçage. */
function adresseSuivante() {
  compteurAdresses += 1;
  return `10.200.${Math.floor(compteurAdresses / 250) % 256}.${(compteurAdresses % 250) + 1}`;
}

class ErreurApi extends Error {
  constructor(methode, chemin, statut, corps) {
    const message = corps && typeof corps === 'object' ? JSON.stringify(corps.message ?? corps) : String(corps);
    // 404 / 405 : route renommée ou verbe changé, le cas typique d'une évolution de l'API.
    const rappel = statut === 404 || statut === 405 ? ` (${RAPPEL_ADAPTATION})` : '';
    super(`${methode} ${chemin} → ${statut} : ${message}${rappel}`);
    this.statut = statut;
    this.corps = corps;
  }
}

/**
 * Contrôle de forme d'une réponse lue par l'amorçage : si l'API change de
 * forme (vagues 2 et 3), l'amorçage s'arrête sur un message qui dit quoi
 * adapter, plutôt que sur « Cannot read properties of undefined ».
 */
function exiger(corps, champs, origine) {
  const absents = champs.filter((champ) => corps === null || typeof corps !== 'object' || corps[champ] === undefined);
  if (absents.length > 0) {
    const liste = absents.map((champ) => `« ${champ} »`).join(', ');
    throw new Error(`Réponse inattendue de ${origine} : ${liste} absent(s). ${RAPPEL_ADAPTATION}`);
  }
  return corps;
}

async function lireCorps(reponse) {
  const texte = await reponse.text();
  if (!texte) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return texte;
  }
}

/**
 * Ouvre une session sur un compte local. `nom` ne sert qu'aux messages
 * d'erreur (« tech1 », « lea »…).
 */
async function ouvrirSession({ nom, email, motDePasse }) {
  const cookies = new Map();

  function enregistrerCookies(reponse) {
    for (const entete of reponse.headers.getSetCookie()) {
      const [paire] = entete.split(';');
      const egal = paire.indexOf('=');
      cookies.set(paire.slice(0, egal).trim(), paire.slice(egal + 1).trim());
    }
  }

  async function brut(methode, chemin, { json, formulaire } = {}) {
    const entetes = {
      'CF-Connecting-IP': adresseSuivante(),
      'User-Agent': 'bmad-recette-amorcage/1.0',
      Accept: 'application/json',
    };
    if (methode !== 'GET') entetes['X-Requested-With'] = 'XMLHttpRequest';
    if (cookies.size > 0) entetes.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let corps;
    if (json !== undefined) {
      entetes['Content-Type'] = 'application/json';
      corps = JSON.stringify(json);
    } else if (formulaire) {
      corps = formulaire;
    }
    const reponse = await fetch(`${BASE_URL}/api${chemin}`, { method: methode, headers: entetes, body: corps });
    enregistrerCookies(reponse);
    return reponse;
  }

  async function connecter() {
    const reponse = await brut('POST', '/auth/local-login', { json: { email, password: motDePasse } });
    const corps = await lireCorps(reponse);
    if (!reponse.ok) throw new ErreurApi('POST', `/auth/local-login (${nom})`, reponse.status, corps);
    if (corps?.mustChangePassword) {
      throw new Error(`Le compte ${email} exige un changement de mot de passe : amorçage incohérent.`);
    }
  }

  async function appeler(methode, chemin, options) {
    let reponse = await brut(methode, chemin, options);
    if (reponse.status === 401) {
      await connecter();
      reponse = await brut(methode, chemin, options);
    }
    const corps = await lireCorps(reponse);
    if (!reponse.ok) throw new ErreurApi(methode, chemin, reponse.status, corps);
    return corps;
  }

  await connecter();
  return {
    nom,
    email,
    get: (chemin) => appeler('GET', chemin),
    post: (chemin, json) => appeler('POST', chemin, { json: json ?? {} }),
    put: (chemin, json) => appeler('PUT', chemin, { json }),
    patch: (chemin, json) => appeler('PATCH', chemin, { json: json ?? {} }),
    supprimer: (chemin) => appeler('DELETE', chemin),
    /** Envoi d'un fichier (multipart, champ « file »), comme le formulaire des filiales. */
    televerser: (chemin, nomFichier, type, contenu) => {
      const formulaire = new FormData();
      formulaire.append('file', new Blob([contenu], { type }), nomFichier);
      return appeler('PATCH', chemin, { formulaire });
    },
  };
}

/** Attend que l'API réponde « prête » (base joignable). */
async function attendreApiPrete(delaiMs = 180_000) {
  const limite = Date.now() + delaiMs;
  while (Date.now() < limite) {
    try {
      const reponse = await fetch(`${BASE_URL}/api/health/ready`);
      if (reponse.ok) return;
    } catch {
      // pas encore joignable : on réessaie
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`L'API ${BASE_URL}/api/health/ready ne répond pas après ${delaiMs / 1000} s`);
}

module.exports = { BASE_URL, ouvrirSession, attendreApiPrete, exiger, ErreurApi };
