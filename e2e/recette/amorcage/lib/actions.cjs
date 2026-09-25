'use strict';
/**
 * Tous les appels de l'amorçage à l'API de l'application, et eux seuls (la
 * session, les en-têtes et les erreurs HTTP sont dans client-api.cjs) :
 *   - référentiels, en session admin : filiales, catalogue, packs, comptes
 *     manuels ;
 *   - gestes métier, chacun rejouant la suite d'appels que fait l'interface
 *     (frontend/src/pages/bons/BonDetail.tsx et detail/use*Actions.ts) :
 *       - remise par email : cachet IT, puis envoi ;
 *       - remise présentielle : cachet IT, puis lien présentiel, puis
 *         signature recueillie par le technicien sur son poste ;
 *       - restitution par email : marquage des équipements rendus, puis cachet IT ;
 *       - restitution présentielle : cachet IT, puis lien présentiel, puis signature ;
 *   - lectures de contrôle : bon, intégrité des signatures, état d'un lien de
 *     signature, régénération des PDF manquants.
 * Si une route, une forme de réponse ou l'ordre de ces appels change dans
 * l'application (vagues 2 et 3), c'est ici qu'il faut l'adapter, nulle part
 * ailleurs. Chaque réponse lue passe par exiger(), qui le rappelle.
 */
const { exiger } = require('./client-api.cjs');
const { signatureDataUrl } = require('./png.cjs');
const { lienDeSignature } = require('./mailpit.cjs');

/** Le backend ignore un second cachet IT posé moins de 10 s après le précédent
 *  sur le même bon (protection contre le double clic) : on laisse passer 11 s. */
const INTERVALLE_CACHETS_MS = 11_000;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Date calendaire (YYYY-MM-DD, heure de Paris) décalée de `jours` par rapport à aujourd'hui. */
function dateDecalee(jours) {
  const instant = new Date(Date.now() + jours * 86_400_000);
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(instant);
}

async function patienterAvantSignatureIt(ctx, bonId) {
  const derniere = ctx.horlogeIt.get(bonId);
  if (derniere) {
    const reste = INTERVALLE_CACHETS_MS - (Date.now() - derniere);
    if (reste > 0) await pause(reste);
  }
}

function noterSignatureIt(ctx, bonId) {
  ctx.horlogeIt.set(bonId, Date.now());
}

// ── Référentiels (session admin) ─────────────────────────────────────────

/** Filiale active ; avec `images` ({ logo, cachet } en PNG), téléversées comme dans l'écran des filiales. */
async function creerFiliale(admin, { cle, nom, adresse, siret }, images) {
  const corps = { name: cle, displayName: nom, address: adresse, siret };
  const { id } = exiger(await admin.post('/filiales', corps), ['id'], 'POST /filiales');
  if (images) {
    await admin.televerser(`/filiales/${id}/logo`, `logo-${cle.toLowerCase()}.png`, 'image/png', images.logo);
    await admin.televerser(`/filiales/${id}/stamp`, `cachet-${cle.toLowerCase()}.png`, 'image/png', images.cachet);
  }
  return id;
}

async function desactiverFiliale(admin, filialeId) {
  await admin.put(`/filiales/${filialeId}`, { active: false });
}

async function creerArticle(admin, { categorie, marque, modele, description }) {
  const corps = { category: categorie, brand: marque, model: modele, description };
  return exiger(await admin.post('/equipment/catalog', corps), ['id'], 'POST /equipment/catalog').id;
}

/** Article retiré du catalogue : il reste visible, mais inutilisable dans un nouveau bon. */
async function retirerArticle(admin, articleId) {
  await admin.put(`/equipment/catalog/${articleId}`, { active: false });
}

/** Pack : `idsArticles` dans l'ordre du pack, une unité de chaque. */
async function creerPack(admin, { nom, description }, idsArticles) {
  const items = idsArticles.map((catalogItemId, order) => ({ catalogItemId, quantity: 1, order }));
  return exiger(await admin.post('/equipment/packs', { name: nom, description, items }), ['id'], 'POST /equipment/packs').id;
}

/** Compte manuel (compagnon de chantier sans adresse), comme le crée l'IT depuis l'application. */
async function creerCompteManuel(admin, { prenom, nomFamille, departement }, filialeId) {
  const corps = { firstName: prenom, lastName: nomFamille, department: departement, filialeId };
  return exiger(await admin.post('/users/manual', corps), ['id'], 'POST /users/manual').id;
}

// ── Lectures de contrôle ─────────────────────────────────────────────────

/** Fiche d'un bon : référence, statut, équipements (id et numéro de série). */
async function relireBon(ctx, bonId) {
  const bon = exiger(await ctx.sessions.admin.get(`/bons/${bonId}`), ['reference', 'status', 'equipments'], 'GET /bons/:id');
  for (const equipement of bon.equipments) exiger(equipement, ['id', 'serialNumber'], 'GET /bons/:id (equipments[])');
  return bon;
}

/** Numéros de série de tous les équipements du bon. */
async function seriesDuBon(ctx, bonId) {
  return (await relireBon(ctx, bonId)).equipments.map((e) => e.serialNumber);
}

/** Verdict de l'application sur les sceaux des signatures du bon ({ allValid, … }). */
async function integriteDuBon(ctx, bonId) {
  return exiger(await ctx.sessions.admin.get(`/bons/${bonId}/integrity`), ['allValid'], 'GET /bons/:id/integrity');
}

/** Le lien `token` est-il en attente de signature, et pour ce type de document ? */
async function lienEnAttente(session, token, type) {
  const info = exiger(await session.get(`/signature/${token}`), ['status', 'signature'], 'GET /signature/:token');
  return info.status === 'pending' && exiger(info.signature, ['type'], 'GET /signature/:token (signature)').type === type;
}

/** Fait régénérer par l'application les PDF de preuve absents ; rend { regenerated, failed }. */
async function regenererPdfManquants(ctx) {
  const bilan = await ctx.sessions.admin.post('/admin/pdf/regenerate-missing');
  return exiger(bilan, ['regenerated', 'failed'], 'POST /admin/pdf/regenerate-missing');
}

// ── Gestes métier ────────────────────────────────────────────────────────

/** Identifiants des équipements du bon portant ces numéros de série. */
async function equipementsParSerie(ctx, bonId, series) {
  const bon = await relireBon(ctx, bonId);
  return series.map((serie) => {
    const equipement = bon.equipments.find((e) => e.serialNumber === serie);
    if (!equipement) throw new Error(`Équipement ${serie} introuvable sur le bon ${bon.reference}`);
    return equipement.id;
  });
}

/**
 * Crée un bon (brouillon). `articles` : [{ cle, serie, inventaire }] ; `pack` :
 * clé d'un pack importé sans numéro de série (brouillon « à compléter »).
 */
async function creerBon(ctx, spec) {
  const personne = ctx.personnes[spec.collaborateur];
  const corps = {
    filialeId: ctx.filiales[spec.filiale],
    collaborateurId: personne.id,
    civilite: personne.civilite,
    dateMiseDisposition: dateDecalee(-spec.remiseIlYA),
    ...(spec.restitutionPrevue !== undefined ? { dateRestitution: dateDecalee(spec.restitutionPrevue) } : {}),
    ...(spec.notes ? { notes: spec.notes } : {}),
    ...(spec.pack ? { packId: ctx.packs[spec.pack] } : {}),
    equipments: (spec.articles ?? []).map((a, index) => ({
      catalogItemId: ctx.articles[a.cle],
      ...(a.serie ? { serialNumber: a.serie } : {}),
      ...(a.inventaire ? { inventoryNumber: a.inventaire } : {}),
      order: index,
    })),
  };
  const cree = exiger(await ctx.sessions[spec.par].post('/bons', corps), ['id', 'reference'], 'POST /bons');
  return { id: cree.id, reference: cree.reference };
}

async function apposerCachet(ctx, bon, par, pdfType) {
  await patienterAvantSignatureIt(ctx, bon.id);
  await ctx.sessions[par].post(`/bons/${bon.id}/sign-it`, {
    signatureDataUrl: signatureDataUrl(par),
    pdfType,
  });
  noterSignatureIt(ctx, bon.id);
}

/** Remise par email : cachet IT puis envoi du lien au collaborateur. */
async function envoyer(ctx, bon, par) {
  await apposerCachet(ctx, bon, par, 'mise_disposition');
  await ctx.sessions[par].post(`/bons/${bon.id}/send`);
}

/** Lien de signature présentiel, ouvert sur le poste du technicien. */
async function lienPresentiel(ctx, bon, par, type) {
  const reponse = await ctx.sessions[par].post(`/bons/${bon.id}/initiate-inperson`, { type });
  return exiger(reponse, ['token'], 'POST /bons/:id/initiate-inperson');
}

/** Signature recueillie par le technicien sur son poste (présentiel, mandataire). */
async function signerSurPlace(ctx, par, token, signataire) {
  await ctx.sessions[par].post(`/signature/${token}/sign`, {
    signatureDataUrl: signatureDataUrl(signataire),
    mentionLuApprouve: true,
  });
}

/** Remise présentielle complète : le bon passe « En cours ». */
async function remisePresentielle(ctx, bon, par, collaborateur, { signer = true } = {}) {
  await apposerCachet(ctx, bon, par, 'mise_disposition');
  const { token } = await lienPresentiel(ctx, bon, par, 'mise_disposition');
  if (signer) await signerSurPlace(ctx, par, token, collaborateur);
}

/** Le collaborateur ouvre le lien reçu dans Mailpit, se connecte et signe. */
async function signerADistance(ctx, bon, collaborateur, type) {
  const personne = ctx.personnes[collaborateur];
  const session = await ctx.sessionCollaborateur(collaborateur);
  const convient = (jeton) => lienEnAttente(session, jeton, type);
  const token = await lienDeSignature(personne.email, bon.reference, convient, `lien « ${type} »`);
  await session.post(`/signature/${token}/sign`, {
    signatureDataUrl: signatureDataUrl(collaborateur),
    mentionLuApprouve: true,
  });
}

/** Restitution par email des équipements `series` : marquage, puis cachet IT. */
async function demanderRestitution(ctx, bon, par, series) {
  const ids = await equipementsParSerie(ctx, bon.id, series);
  await ctx.sessions[par].post(`/bons/${bon.id}/initiate-restitution`, { returnedEquipmentIds: ids });
  await apposerCachet(ctx, bon, par, 'restitution');
}

/** Restitution présentielle de tout ce qui reste : cachet IT, lien, signature sur place. */
async function restitutionPresentielle(ctx, bon, par, collaborateur, { signer = true } = {}) {
  await apposerCachet(ctx, bon, par, 'restitution');
  const { token } = await lienPresentiel(ctx, bon, par, 'restitution');
  if (signer) await signerSurPlace(ctx, par, token, collaborateur);
}

async function declarerNonRestitue(ctx, bon, par, series, motif) {
  const ids = await equipementsParSerie(ctx, bon.id, series);
  await patienterAvantSignatureIt(ctx, bon.id);
  await ctx.sessions[par].post(`/bons/${bon.id}/declare-not-returned`, {
    equipmentIds: ids,
    reason: motif,
    signatureDataUrl: signatureDataUrl(par),
  });
  noterSignatureIt(ctx, bon.id);
}

async function marquerRetrouve(ctx, bon, par, series) {
  const ids = await equipementsParSerie(ctx, bon.id, series);
  await patienterAvantSignatureIt(ctx, bon.id);
  await ctx.sessions[par].post(`/bons/${bon.id}/mark-found`, {
    equipmentIds: ids,
    signatureDataUrl: signatureDataUrl(par),
  });
  noterSignatureIt(ctx, bon.id);
}

async function cloturerSansSignature(ctx, bon, par, motif) {
  await ctx.sessions[par].post(`/bons/${bon.id}/close-unilateral`, { reason: motif });
}

async function annuler(ctx, bon, par) {
  await ctx.sessions[par].supprimer(`/bons/${bon.id}`);
}

async function contester(ctx, bon, collaborateur, message) {
  const session = await ctx.sessionCollaborateur(collaborateur);
  await session.post(`/bons/${bon.id}/contestation`, { message });
}

module.exports = {
  creerFiliale,
  desactiverFiliale,
  creerArticle,
  retirerArticle,
  creerPack,
  creerCompteManuel,
  relireBon,
  seriesDuBon,
  integriteDuBon,
  regenererPdfManquants,
  dateDecalee,
  creerBon,
  apposerCachet,
  envoyer,
  remisePresentielle,
  signerADistance,
  demanderRestitution,
  restitutionPresentielle,
  declarerNonRestitue,
  marquerRetrouve,
  cloturerSansSignature,
  annuler,
  contester,
};
