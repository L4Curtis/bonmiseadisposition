import type { BonCollab } from '../types';

const SIGNABLE_TYPES = new Set(['mise_disposition', 'restitution', 'pv_cloture']);

/** Signature non signée, non expirée, d'un type réellement signable par le
 *  collaborateur (exclut it_cachet). Utilisé pour classer un bon dans « à
 *  signer » indépendamment de son statut global (ex : partially_returned
 *  peut porter une restitution OU un PV en attente). */
export function findPendingSignable(bon: BonCollab): SignatureInfoLike | undefined {
  return bon.signatures?.find(
    (s) =>
      SIGNABLE_TYPES.has(s.type) &&
      !s.signed &&
      !!s.tokenExpiresAt &&
      new Date(s.tokenExpiresAt) > new Date(),
  );
}

type SignatureInfoLike = BonCollab['signatures'][number];

export function hasPendingSignable(bon: BonCollab): boolean {
  return !!findPendingSignable(bon);
}

/** Étape de signature dans une phrase : lexique commun, partagé avec la page de signature. */
export { signatureStepInSentence as signatureTypeLabel } from '@/domain/labels';

export interface BonGroups {
  pending: BonCollab[];
  active: BonCollab[];
  contested: BonCollab[];
  others: BonCollab[];
}

/** Répartit les bons du collaborateur entre les sections de la page :
 *  - à signer : envoyés en attente, ou partially_returned avec une signature
 *    signable non expirée (restitution ou PV selon le cas) ;
 *  - en cours (active), en contestation, et le reste en historique. */
export function groupBons(bons: BonCollab[]): BonGroups {
  const pending = bons.filter((b) =>
    ['sent_mise_dispo', 'sent_restitution'].includes(b.status) ||
    (b.status === 'partially_returned' && hasPendingSignable(b)),
  );
  const active = bons.filter((b) => b.status === 'active');
  const contested = bons.filter((b) => b.status === 'contested');
  const activeStatuses = new Set(['sent_mise_dispo', 'sent_restitution', 'active', 'contested']);
  const others = bons.filter((b) =>
    !activeStatuses.has(b.status) &&
    !(b.status === 'partially_returned' && hasPendingSignable(b)),
  );
  return { pending, active, contested, others };
}
