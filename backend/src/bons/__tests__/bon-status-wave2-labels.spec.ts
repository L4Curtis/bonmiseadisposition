import { ContestationOutcome, SignatureInvalidationReason } from '@prisma/client';
import {
  BON_SUB_STATUS_LABELS,
  BON_SUB_STATUSES,
  CIVILITE_LABELS,
  CIVILITE_LONG_LABELS,
  CONTESTATION_OUTCOME_LABELS,
  LINK_INVALIDATION_LABELS,
  LINK_INVALIDATION_MESSAGES,
  WITHOUT_SIGNATURE_ACTION_LABELS,
  WITHOUT_SIGNATURE_DONE_LABELS,
  bonSubStatusLabel,
} from '../bon-status';

/**
 * Libellés de la vague 2. Les MÊMES chaînes sont vérifiées côté écran par
 * frontend/src/domain/__tests__/labels.test.ts : changer un mot, c'est changer
 * les deux fichiers et les deux tests.
 */
describe('bon-status — libellés de la vague 2', () => {
  it('sous-états de « Restitution en cours », dans leur ordre de priorité', () => {
    expect(BON_SUB_STATUSES).toEqual(['pv_to_sign', 'partial_restitution_to_sign', 'loss_declared', 'equipment_still_out']);
    expect(BON_SUB_STATUS_LABELS).toEqual({
      pv_to_sign: 'PV de non-restitution à signer',
      partial_restitution_to_sign: 'Restitution partielle à signer',
      loss_declared: 'Perte déclarée',
      equipment_still_out: 'Équipements encore chez le collaborateur',
    });
    expect(bonSubStatusLabel('loss_declared')).toBe('Perte déclarée');
    expect(bonSubStatusLabel('constructor')).toBe('constructor');
  });

  it('issues de contestation : Fondée / Non retenue, une par valeur de la base', () => {
    expect(CONTESTATION_OUTCOME_LABELS).toEqual({ founded: 'Fondée', not_retained: 'Non retenue' });
    expect(Object.keys(CONTESTATION_OUTCOME_LABELS).sort()).toEqual(Object.values(ContestationOutcome).sort());
  });

  it('les deux gestes sans signature, à l’infinitif (bouton) et au participe (historique)', () => {
    expect(WITHOUT_SIGNATURE_ACTION_LABELS).toEqual({
      handover_without_signature: 'Constater la remise sans signature',
      closed_without_signature: 'Clôturer sans signature',
    });
    expect(WITHOUT_SIGNATURE_DONE_LABELS).toEqual({
      handover_without_signature: 'Remise constatée sans signature',
      closed_without_signature: 'Clôturé sans signature',
    });
  });

  it('motifs d’invalidation d’un lien : un libellé IT et un message collaborateur par valeur de la base', () => {
    const reasons = Object.values(SignatureInvalidationReason).sort();
    expect(Object.keys(LINK_INVALIDATION_LABELS).sort()).toEqual(reasons);
    expect(Object.keys(LINK_INVALIDATION_MESSAGES).sort()).toEqual(reasons);
    expect(LINK_INVALIDATION_LABELS).toEqual({
      replaced: 'Remplacé par un nouveau lien',
      in_person: 'Signature au guichet',
      modified: 'Bon modifié',
      cancelled: 'Bon annulé',
      contested: 'Bon contesté',
      handover_without_signature: 'Remise constatée sans signature',
      closed_without_signature: 'Clôturé sans signature',
      account_deactivated: 'Compte désactivé',
    });
    expect(LINK_INVALIDATION_MESSAGES).toEqual({
      replaced: 'Ce lien a été remplacé : un nouveau lien vous a été envoyé par email.',
      in_person: "Ce document se signe au guichet, avec l'équipe informatique.",
      modified: 'Ce bon a été modifié : un nouveau lien vous sera envoyé.',
      cancelled: "Ce bon a été annulé : il n'y a plus rien à signer.",
      contested: "Votre contestation est en cours de traitement : il n'y a rien à signer pour l'instant.",
      handover_without_signature: "La remise a été enregistrée sans votre signature : il n'y a plus rien à signer.",
      closed_without_signature: "Ce bon a été clôturé : il n'y a plus rien à signer.",
      account_deactivated: "Votre compte est désactivé : adressez-vous à l'équipe informatique.",
    });
  });

  it('civilités : abrégée (bon, PDF) et longue (emails)', () => {
    expect(CIVILITE_LABELS).toEqual({ mme: 'Mme', mr: 'M.' });
    expect(CIVILITE_LONG_LABELS).toEqual({ mme: 'Madame', mr: 'Monsieur' });
  });

  it('tous ces libellés sont figés', () => {
    for (const labels of [
      BON_SUB_STATUSES, BON_SUB_STATUS_LABELS, CONTESTATION_OUTCOME_LABELS, WITHOUT_SIGNATURE_ACTION_LABELS,
      WITHOUT_SIGNATURE_DONE_LABELS, LINK_INVALIDATION_LABELS, LINK_INVALIDATION_MESSAGES, CIVILITE_LABELS,
      CIVILITE_LONG_LABELS,
    ]) {
      expect(Object.isFrozen(labels)).toBe(true);
    }
  });
});
