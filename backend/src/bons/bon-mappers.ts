/**
 * Forme minimale d'une signature attendue par `mapCollaborateurBons` — plus
 * permissive que le type exact généré par Prisma (même procédé que
 * `common/types.NotificationBon`).
 */
export interface PortalBonSignature {
  signed: boolean;
  type: string;
  isInPerson: boolean;
  tokenExpiresAt: Date | string;
  createdAt?: Date | string;
  invalidatedAt?: Date | string | null;
  token?: string;
}

export interface PortalBon {
  signatures: PortalBonSignature[];
}

const time = (value: Date | string | undefined | null) => (value ? new Date(value).getTime() : 0);

/** Lien par email encore « vivant » : ni signé, ni cachet IT, ni présentiel,
 *  ni invalidé volontairement (échéance ramenée à l'epoch). */
function isEmailLink(s: PortalBonSignature): boolean {
  return !s.signed && s.type !== 'it_cachet' && !s.isInPerson && !s.invalidatedAt && time(s.tokenExpiresAt) > 1000;
}

/**
 * Jetons exposés au collaborateur, et seulement ceux-là :
 *  - le lien signable (non signé, hors signature IT, non expiré, non
 *    présentiel) : « Signer maintenant » ;
 *  - le DERNIER lien par email expiré (non invalidé) : le portail propose
 *    « Demander un nouveau lien », qui s'appuie sur ce jeton ;
 *  - une signature présentielle en attente porte `inPersonPending: true`, sans
 *    jeton (elle se signe en face du technicien).
 * Tous les autres jetons (signés, invalidés, anciens, cachet IT) sont retirés.
 */
export function mapCollaborateurBons<T extends PortalBon>(bons: T[], now: number = Date.now()): T[] {
  return bons.map((bon) => {
    const lastExpired = bon.signatures
      .filter((s) => isEmailLink(s) && time(s.tokenExpiresAt) <= now)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
    return {
      ...bon,
      signatures: bon.signatures.map((s) => {
        const signable = !s.signed && s.type !== 'it_cachet' && !s.invalidatedAt && time(s.tokenExpiresAt) > now;
        if (signable && s.isInPerson) return { ...s, token: undefined, inPersonPending: true };
        if (signable || s === lastExpired) return s;
        return { ...s, token: undefined };
      }),
    };
  });
}
