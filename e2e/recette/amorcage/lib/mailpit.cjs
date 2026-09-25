'use strict';
/**
 * Lecture des emails capturés par Mailpit (API HTTP du banc, port 8027) :
 * c'est là que l'amorçage récupère les liens de signature envoyés aux
 * collaborateurs, comme le ferait un collaborateur qui ouvre sa messagerie.
 * Ce module ne connaît que l'API de Mailpit, jamais celle de l'application.
 */

const MAILPIT_URL = 'http://localhost:8027';

async function lireJson(chemin) {
  const reponse = await fetch(`${MAILPIT_URL}${chemin}`);
  if (!reponse.ok) throw new Error(`Mailpit ${chemin} → ${reponse.status}`);
  return reponse.json();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Nombre total de messages capturés. */
async function nombreMessages() {
  const { total } = await lireJson('/api/v1/messages?limit=1');
  return total;
}

/**
 * Attend que les emails partis « en tâche de fond » par le backend soient
 * arrivés : le total de Mailpit ne bouge plus pendant 1,5 s.
 */
async function attendreCalme() {
  let precedent = await nombreMessages();
  let stableDepuis = Date.now();
  const limite = Date.now() + 30_000;
  while (Date.now() - stableDepuis < 1500 && Date.now() < limite) {
    await pause(300);
    const actuel = await nombreMessages();
    if (actuel !== precedent) {
      precedent = actuel;
      stableDepuis = Date.now();
    }
  }
}

/**
 * Cherche, dans les emails reçus par `adresse` au sujet de `reference`, un
 * lien de signature que `convient(jeton)` accepte, du plus récent au plus
 * ancien (les rappels exclus), et réessaie le temps que l'email arrive.
 * `convient` interroge l'application (voir lib/actions.cjs) : un lien
 * remplacé ou déjà signé est ainsi écarté. `quoi` ne sert qu'au message
 * d'erreur (« lien mise_disposition »…).
 */
async function lienDeSignature(adresse, reference, convient, quoi = 'lien', delaiMs = 45_000) {
  const limite = Date.now() + delaiMs;
  const requete = encodeURIComponent(`to:"${adresse}"`);
  while (Date.now() < limite) {
    const { messages } = await lireJson(`/api/v1/search?query=${requete}&limit=200`);
    const candidats = messages.filter((m) => m.Subject.includes(`[${reference}]`) && !m.Subject.startsWith('[RAPPEL]'));
    for (const message of candidats) {
      const detail = await lireJson(`/api/v1/message/${message.ID}`);
      const trouve = (detail.HTML ?? '').match(/\/signer\/([A-Za-z0-9_-]+)/);
      if (trouve && (await convient(trouve[1]))) return trouve[1];
    }
    await pause(500);
  }
  throw new Error(`Aucun ${quoi} en attente pour ${reference} dans la boîte ${adresse}`);
}

module.exports = { MAILPIT_URL, attendreCalme, lienDeSignature, nombreMessages };
