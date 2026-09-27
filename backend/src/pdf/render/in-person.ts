import type { BonForPdf, PdfSignature } from '../pdf-types';

/**
 * Qui tenait l'appareil lors d'une signature au guichet :
 * - `holder` : le titulaire, sur son propre compte ;
 * - `witness` : un autre compte (le technicien) — le titulaire signe devant
 *   lui : « en présence de » ce compte ;
 * - `proxy` : un mandataire, qui signe pour le compte du collaborateur
 *   (`signedByProxy`, jamais posé pour un compte IT).
 * `null` pour une signature à distance ou une signature IT.
 */
export type InPersonRole = 'holder' | 'witness' | 'proxy';

function normalized(email: string | null | undefined): string | null {
  const value = email?.toLowerCase().trim();
  return value ? value : null;
}

export function inPersonRole(bon: Pick<BonForPdf, 'collaborateurEmail'>, sig: PdfSignature): InPersonRole | null {
  if (!sig.isInPerson || sig.type === 'it_cachet') return null;
  if (sig.signedByProxy) return 'proxy';
  const account = normalized(sig.signerEmail);
  return account !== null && account !== normalized(bon.collaborateurEmail) ? 'witness' : 'holder';
}
