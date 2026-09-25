import { describe, it, expect } from 'vitest';
import {
  BON_STATUS_LABELS,
  CATEGORY_LABELS,
  CONTESTATION_STATUS_LABELS,
  CONTESTATION_STATUS_OPTIONS,
  DOCUMENT_LABELS,
  LATENESS_LABELS,
  NOTIFICATION_TYPE_LABELS,
  PDF_SNAPSHOT_LABELS,
  PDF_STAGE_LABELS,
  RESTITUTION_STEP_LABELS,
  ROLE_LABELS,
  SCREEN_LABELS,
  SIGNATURE_TYPE_LABELS,
  TERMS,
  bonStatusLabel,
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
    ...Object.values(RESTITUTION_STEP_LABELS),
    ...Object.values(ROLE_LABELS),
    ...Object.values(CATEGORY_LABELS),
    ...Object.values(SIGNATURE_TYPE_LABELS),
    ...Object.values(DOCUMENT_LABELS),
    ...Object.values(PDF_SNAPSHOT_LABELS),
    ...Object.values(PDF_STAGE_LABELS),
    ...Object.values(CONTESTATION_STATUS_LABELS),
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

  it('sous-états de « Restitution en cours »', () => {
    expect(Object.values(RESTITUTION_STEP_LABELS)).toEqual([
      'PV à signer',
      'Restitution partielle à signer',
      'Équipements encore chez le collaborateur',
      'Perte déclarée',
    ]);
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
