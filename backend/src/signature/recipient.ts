/** Message d'un compte qui n'est pas le destinataire : jamais l'adresse du
 *  destinataire, ni celle de l'appelant (R-039). */
export const NOT_RECIPIENT_MESSAGE =
  "Ce document ne vous est pas destiné : connectez-vous avec le compte du collaborateur concerné, ou demandez à l'équipe informatique de vous le faire signer au guichet.";

/**
 * Le destinataire légitime d'un lien de signature : le mode présentiel (tout
 * compte authentifié peut recueillir la signature — décision produit, pas de
 * restriction aux comptes IT), OU le titulaire du bon identifié par id (fiable
 * même après un changement d'adresse AD) OU par email (compat / trace).
 *
 * Fonction pure extraite de SignatureService, partagée par getBonInfoByToken,
 * getPreviewPdfByToken et sign().
 */
export function isRecipient(
  bon: { id: string; collaborateurId: string; collaborateurEmail: string | null },
  isInPerson: boolean,
  requesterEmail?: string,
  requesterId?: string,
): boolean {
  if (isInPerson) return true;
  if (requesterId && requesterId === bon.collaborateurId) return true;
  // Collaborateur sans adresse (compte manuel) : seule la correspondance par
  // id (ou le présentiel, déjà traité ci-dessus) peut identifier le
  // destinataire — il n'y a pas d'email à comparer.
  if (!bon.collaborateurEmail) return false;
  return bon.collaborateurEmail.toLowerCase().trim() === (requesterEmail ?? '').toLowerCase().trim();
}
