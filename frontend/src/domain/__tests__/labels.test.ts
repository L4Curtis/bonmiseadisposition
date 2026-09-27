import { describe, it, expect } from 'vitest';
import {
  BON_STATUS_LABELS,
  BON_SUB_STATUS_LABELS,
  CATEGORY_LABELS,
  CIVILITE_LABELS,
  CIVILITE_LONG_LABELS,
  CONTESTATION_OUTCOME_LABELS,
  CONTESTATION_STATUS_LABELS,
  CONTESTATION_STATUS_OPTIONS,
  DOCUMENT_LABELS,
  LATENESS_LABELS,
  LINK_INVALIDATION_LABELS,
  LINK_INVALIDATION_MESSAGES,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
  PDF_SNAPSHOT_LABELS,
  PDF_STAGE_LABELS,
  ROLE_LABELS,
  SCREEN_LABELS,
  SIGNATURE_TYPE_LABELS,
  TERMS,
  WITHOUT_SIGNATURE_ACTION_LABELS,
  WITHOUT_SIGNATURE_DONE_LABELS,
  bonStatusLabel,
  bonSubStatusLabel,
  categoryLabel,
  labelOrKey,
  notificationTypeLabel,
  roleLabel,
  signatureStepInSentence,
  signedDocumentPhrase,
} from '../labels';

/** Mots écartés par le propriétaire (décisions du 24/09) : aucun libellé du
 *  lexique ne doit les employer. */
const FORBIDDEN = [
  /\bActif\b/,
  /Archivé/,
  /En attente de (signature|restitution)/,
  /Restitution partielle$/,
  /cachet IT/i,
  /non rendu/i,
  /PV de clôture/,
  /équipements manquants/i,
  /Résolue|Rejetée/,
  /^En retard$/,
  /Collaborateurs/,
];

function allLabels(): string[] {
  return [
    ...Object.values(BON_STATUS_LABELS),
    ...Object.values(BON_SUB_STATUS_LABELS),
    ...Object.values(ROLE_LABELS),
    ...Object.values(CATEGORY_LABELS),
    ...Object.values(SIGNATURE_TYPE_LABELS),
    ...Object.values(DOCUMENT_LABELS),
    ...Object.values(PDF_SNAPSHOT_LABELS),
    ...Object.values(PDF_STAGE_LABELS),
    ...Object.values(CONTESTATION_STATUS_LABELS),
    ...Object.values(CONTESTATION_OUTCOME_LABELS),
    ...Object.values(WITHOUT_SIGNATURE_ACTION_LABELS),
    ...Object.values(WITHOUT_SIGNATURE_DONE_LABELS),
    ...Object.values(LINK_INVALIDATION_LABELS),
    ...Object.values(LINK_INVALIDATION_MESSAGES),
    ...Object.values(CIVILITE_LABELS),
    ...Object.values(NOTIFICATION_STATUS_LABELS),
    ...Object.values(LATENESS_LABELS),
    ...Object.values(NOTIFICATION_TYPE_LABELS),
    ...Object.values(SCREEN_LABELS),
    ...Object.values(TERMS),
  ];
}

describe('lexique — vocabulaire du propriétaire', () => {
  it('statuts du bon', () => {
    expect(BON_STATUS_LABELS).toEqual({
      draft: 'Brouillon',
      sent_mise_dispo: 'Remise à signer',
      active: 'En cours',
      sent_restitution: 'Restitution à signer',
      partially_returned: 'Restitution en cours',
      archived: 'Clôturé',
      cancelled: 'Annulé',
      contested: 'Contesté',
    });
  });

  // Les libellés de la vague 2 ci-dessous sont les MÊMES chaînes que celles
  // vérifiées côté serveur par backend/src/bons/__tests__/bon-status-wave2-labels.spec.ts.
  it('sous-états de « Restitution en cours », dans leur ordre de priorité', () => {
    expect(BON_SUB_STATUS_LABELS).toEqual({
      pv_to_sign: 'PV de non-restitution à signer',
      partial_restitution_to_sign: 'Restitution partielle à signer',
      loss_declared: 'Perte déclarée',
      equipment_still_out: 'Équipements encore chez le collaborateur',
    });
    expect(Object.keys(BON_SUB_STATUS_LABELS)).toEqual([
      'pv_to_sign', 'partial_restitution_to_sign', 'loss_declared', 'equipment_still_out',
    ]);
    expect(bonSubStatusLabel('pv_to_sign')).toBe('PV de non-restitution à signer');
    expect(bonSubStatusLabel('inconnu')).toBe('inconnu');
  });

  it('les deux gestes sans signature', () => {
    expect(WITHOUT_SIGNATURE_ACTION_LABELS).toEqual({
      handover_without_signature: 'Constater la remise sans signature',
      closed_without_signature: 'Clôturer sans signature',
    });
    expect(WITHOUT_SIGNATURE_DONE_LABELS).toEqual({
      handover_without_signature: 'Remise constatée sans signature',
      closed_without_signature: 'Clôturé sans signature',
    });
  });

  it('motifs d’invalidation d’un lien : libellé IT et message au collaborateur', () => {
    expect(LINK_INVALIDATION_LABELS).toEqual({
      replaced: 'Remplacé par un nouveau lien',
      in_person: 'Signature au guichet',
      modified: 'Bon modifié',
      return_corrected: 'Restitution corrigée',
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
      return_corrected: "La restitution a été corrigée par l'équipe informatique : un nouveau lien vous sera envoyé.",
      cancelled: "Ce bon a été annulé : il n'y a plus rien à signer.",
      contested: "Votre contestation est en cours de traitement : il n'y a rien à signer pour l'instant.",
      handover_without_signature: "La remise a été enregistrée sans votre signature : il n'y a plus rien à signer.",
      closed_without_signature: "Ce bon a été clôturé : il n'y a plus rien à signer.",
      account_deactivated: "Votre compte est désactivé : adressez-vous à l'équipe informatique.",
    });
  });

  it('civilités : abrégée et en toutes lettres', () => {
    expect(CIVILITE_LABELS).toEqual({ mme: 'Mme', mr: 'M.' });
    expect(CIVILITE_LONG_LABELS).toEqual({ mme: 'Madame', mr: 'Monsieur' });
  });

  it('journal des emails : statut d’envoi et nouveaux types', () => {
    expect(NOTIFICATION_STATUS_LABELS).toEqual({
      sent: 'Envoyé',
      failed: "Échec de l'envoi",
      bounced: 'Non distribué',
      skipped: 'Non envoyé',
    });
    expect(NOTIFICATION_TYPE_LABELS.handover_without_signature).toBe('Remise constatée sans signature');
    expect(NOTIFICATION_TYPE_LABELS.unilateral_closure).toBe('Clôture sans signature');
    expect(NOTIFICATION_TYPE_LABELS.contestation_overdue_alert).toBe('Relance : contestation non traitée');
    expect(NOTIFICATION_TYPE_LABELS.link_request_alert).toBe("Demande d'un nouveau lien");
    expect(PDF_SNAPSHOT_LABELS.remise_sans_signature).toBe('Remise constatée sans signature');
    expect(PDF_SNAPSHOT_LABELS.cloture_sans_signature).toBe('Clôture sans signature');
  });

  it('rôles', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrateur',
      technician: 'Technicien',
      direction: 'Direction',
      collaborator: 'Collaborateur',
    });
  });

  it('issues de contestation : Fondée / Non retenue', () => {
    expect(CONTESTATION_OUTCOME_LABELS).toEqual({ founded: 'Fondée', not_retained: 'Non retenue' });
    expect(CONTESTATION_STATUS_LABELS.resolved).toBe('Fondée');
    expect(CONTESTATION_STATUS_LABELS.rejected).toBe('Non retenue');
    expect(CONTESTATION_STATUS_OPTIONS.map((o) => o.label)).toEqual([
      'Tous les statuts', 'Ouverte', "En cours d'examen", 'Fondée', 'Non retenue',
    ]);
  });

  it('deux retards, toujours qualifiés', () => {
    expect(LATENESS_LABELS).toEqual({ signature: 'Signature en retard', return: 'Retour en retard' });
  });

  it('documents : signature IT, cachet de la filiale, PV de non-restitution', () => {
    expect(TERMS.itSignature).toBe('signature IT');
    expect(TERMS.filialeStamp).toBe('cachet de la filiale');
    expect(TERMS.nonReturnReport).toBe('PV de non-restitution');
    expect(SIGNATURE_TYPE_LABELS.it_cachet).toBe('Signature IT');
    expect(SIGNATURE_TYPE_LABELS.pv_cloture).toBe('PV de non-restitution');
    expect(DOCUMENT_LABELS.pv_cloture).toBe('PV de non-restitution');
    expect(PDF_SNAPSHOT_LABELS.cloture_equipements_manquants).toBe('PV de non-restitution');
    expect(PDF_STAGE_LABELS.pv_cloture).toBe('PV de non-restitution');
  });

  it('écrans : Utilisateurs et Catalogue', () => {
    expect(SCREEN_LABELS.utilisateurs).toBe('Utilisateurs');
    expect(SCREEN_LABELS.catalogue).toBe('Catalogue');
  });

  it('catégories d’articles : mêmes mots que le serveur (export CSV, inventaire)', () => {
    expect(CATEGORY_LABELS.pc_portable).toBe('PC portable');
    expect(CATEGORY_LABELS.dock).toBe('Station d’accueil');
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(11);
  });

  it('aucun libellé n’emploie un mot écarté', () => {
    for (const label of allLabels()) {
      for (const pattern of FORBIDDEN) {
        expect(label, `« ${label} » contient ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('points de suspension typographiques uniquement', () => {
    for (const label of allLabels()) expect(label).not.toContain('...');
  });
});

describe('signatures dans une phrase', () => {
  it('étape de signature (« Bon de … à signer »)', () => {
    expect(signatureStepInSentence('mise_disposition')).toBe('mise à disposition');
    expect(signatureStepInSentence('restitution')).toBe('restitution');
    expect(signatureStepInSentence('pv_cloture')).toBe('PV de non-restitution');
    expect(signatureStepInSentence(undefined)).toBe('mise à disposition');
  });

  it('document signé en début de phrase', () => {
    expect(signedDocumentPhrase('mise_disposition')).toBe('Le bon de mise à disposition');
    expect(signedDocumentPhrase('restitution')).toBe('Le bon de restitution');
    expect(signedDocumentPhrase('pv_cloture')).toBe('Le PV de non-restitution');
    expect(signedDocumentPhrase(undefined)).toBe('Le bon de mise à disposition');
  });
});

describe('fonctions de lecture', () => {
  it('renvoient le libellé connu', () => {
    expect(bonStatusLabel('archived')).toBe('Clôturé');
    expect(roleLabel('technician')).toBe('Technicien');
    expect(categoryLabel('ecran')).toBe('Écran');
    expect(notificationTypeLabel('unilateral_closure')).toBe('Clôture sans signature');
  });

  it('retombent sur la clé brute pour une valeur inconnue (nouvelle valeur serveur)', () => {
    expect(bonStatusLabel('nouveau_statut')).toBe('nouveau_statut');
    expect(labelOrKey({ a: 'A' }, 'b')).toBe('b');
  });
});
