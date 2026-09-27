import type { BonStatus, SignatureType } from '@prisma/client';

/** Document que le collaborateur signe, donc peut contester (tout sauf la
 *  signature IT). */
export type ContestableDocument = Exclude<SignatureType, 'it_cachet'>;

/** État du bon utile pour décider de ce qui est contestable. */
export interface ContestableBonState {
  status: BonStatus;
  /** Documents qui attendent la signature du collaborateur : liens non signés
   *  et non invalidés, expirés compris. */
  pendingDocuments: readonly ContestableDocument[];
}

export type ContestedDocumentResult =
  | { contestable: true; document: ContestableDocument }
  | { contestable: false; message: string };

const NOT_CONTESTABLE: Readonly<Record<string, string>> = Object.freeze({
  sent_mise_dispo:
    "Ce bon n'est pas encore signé : s'il ne correspond pas à ce que vous avez reçu, ne le signez pas et " +
    "prévenez l'équipe informatique.",
  contested: 'Une contestation est déjà en cours sur ce bon.',
  partially_returned:
    "Aucun document n'attend votre signature sur ce bon : pour signaler un problème, contactez l'équipe informatique.",
});

const CLOSED_MESSAGE = 'Ce bon ne peut plus être contesté.';

/**
 * Décide du document contesté, d'après l'état du bon (décision du 24/09 :
 * on conteste la remise une fois le matériel reçu, la restitution ou le PV au
 * moment de les signer) :
 *  - « En cours » : la remise signée ;
 *  - « Restitution à signer » : la restitution ;
 *  - « Restitution en cours » : le PV à signer s'il y en a un (même priorité
 *    que le sous-état « PV à signer »), sinon la restitution partielle à signer.
 * Tout autre cas est refusé, avec un message pour le collaborateur.
 */
export function resolveContestedDocument(state: ContestableBonState): ContestedDocumentResult {
  if (state.status === 'active') return { contestable: true, document: 'mise_disposition' };
  if (state.status === 'sent_restitution') return { contestable: true, document: 'restitution' };
  if (state.status === 'partially_returned') {
    if (state.pendingDocuments.includes('pv_cloture')) return { contestable: true, document: 'pv_cloture' };
    if (state.pendingDocuments.includes('restitution')) return { contestable: true, document: 'restitution' };
  }
  return { contestable: false, message: NOT_CONTESTABLE[state.status] ?? CLOSED_MESSAGE };
}
