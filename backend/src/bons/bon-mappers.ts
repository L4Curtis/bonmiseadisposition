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
  token?: string;
}

export interface PortalBon {
  signatures: PortalBonSignature[];
}

/**
 * N'exposer le token QUE sur le lien actuellement signable (non signé, non
 * it_cachet, non expiré). Les tokens des signatures déjà signées, invalidées
 * (epoch) ou du cachet IT interne sont retirés. Pour une signature
 * présentielle (isInPerson) en attente, le token n'est pas non plus exposé
 * (elle se signe en face du technicien, pas via un lien envoyé au
 * collaborateur) : `inPersonPending:true` la signale à la place.
 */
export function mapCollaborateurBons<T extends PortalBon>(bons: T[], now: number = Date.now()): PortalBon[] {
  return bons.map((bon) => ({
    ...bon,
    signatures: bon.signatures.map((s) => {
      const signable = !s.signed && s.type !== 'it_cachet' && new Date(s.tokenExpiresAt).getTime() > now;
      if (!signable) return { ...s, token: undefined };
      if (s.isInPerson) return { ...s, token: undefined, inPersonPending: true };
      return s;
    }),
  }));
}
