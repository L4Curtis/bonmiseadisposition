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
  bon: { id: string; collaborateurId: string; collaborateurEmail: string },
  isInPerson: boolean,
  requesterEmail?: string,
  requesterId?: string,
): boolean {
  if (isInPerson) return true;
  if (requesterId && requesterId === bon.collaborateurId) return true;
  return bon.collaborateurEmail.toLowerCase().trim() === (requesterEmail ?? '').toLowerCase().trim();
}
