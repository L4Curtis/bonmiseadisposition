import type { BonStatus } from '@prisma/client';
import {
  actionBlockedReason,
  availableActions,
  BonFacts,
  pendingDocument,
  primaryAction,
  statusAfterReturnChange,
  statusAfterSignature,
  subStatus,
} from '../state-machine';

function facts(overrides: Partial<BonFacts> & { status: BonStatus }): BonFacts {
  return {
    equipmentCount: 3,
    equipmentOut: 3,
    returnedToSign: 0,
    returnedSigned: 0,
    notReturned: 0,
    canSendLink: true,
    linkRefusalMessage: null,
    hasValidLink: false,
    ...overrides,
  };
}

const actionsOf = (f: BonFacts) => availableActions(f).map((a) => a.action);

describe('machine à états du bon', () => {
  describe('document en attente et sous-état', () => {
    it('remise à signer : la remise attend, pas de sous-état', () => {
      const f = facts({ status: 'sent_mise_dispo' });
      expect(pendingDocument(f)).toBe('mise_disposition');
      expect(subStatus(f)).toBeNull();
    });

    it('restitution partielle marquée : la restitution attend (même sans aucune ligne de signature)', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 1, returnedToSign: 2 });
      expect(pendingDocument(f)).toBe('restitution');
      expect(subStatus(f)).toBe('partial_restitution_to_sign');
    });

    it('tout rendu ou perdu, restitution signée : le PV attend', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 0, returnedSigned: 2, notReturned: 1 });
      expect(pendingDocument(f)).toBe('pv_cloture');
      expect(subStatus(f)).toBe('pv_to_sign');
    });

    it('la restitution à signer passe avant le PV', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 0, returnedToSign: 2, notReturned: 1 });
      expect(pendingDocument(f)).toBe('restitution');
      expect(subStatus(f)).toBe('partial_restitution_to_sign');
    });

    it('perte déclarée, équipements encore dehors : rien à signer', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 2, notReturned: 1 });
      expect(pendingDocument(f)).toBeNull();
      expect(subStatus(f)).toBe('loss_declared');
    });

    it('restitution partielle signée, reste dehors : équipements encore chez le collaborateur', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 1, returnedSigned: 2 });
      expect(subStatus(f)).toBe('equipment_still_out');
    });
  });

  describe('actions permises', () => {
    it('brouillon : modifier, envoyer, guichet, annuler ; envoyer est l’action principale', () => {
      const list = availableActions(facts({ status: 'draft' }));
      expect(list.map((a) => a.action)).toEqual(['send', 'send_in_person', 'edit', 'cancel']);
      expect(list[0]).toEqual({ action: 'send', primary: true, blockedReason: null });
    });

    it('compte sans adresse : l’envoi reste visible mais bloqué avec la raison, le guichet passe en tête', () => {
      const list = availableActions(
        facts({ status: 'draft', canSendLink: false, linkRefusalMessage: 'Pas d’adresse.' }),
      );
      expect(list[0]).toEqual({ action: 'send_in_person', primary: true, blockedReason: null });
      expect(list.find((a) => a.action === 'send')?.blockedReason).toBe('Pas d’adresse.');
    });

    it('remise à signer, lien expiré : renvoyer en tête, modifier et annuler possibles', () => {
      const f = facts({ status: 'sent_mise_dispo' });
      expect(primaryAction(f)).toBe('resend');
      expect(actionsOf(f)).toEqual([
        'resend', 'show_in_person_link', 'edit', 'handover_without_signature', 'cancel',
      ]);
    });

    it('remise à signer, lien valide : rien d’urgent (on attend le collaborateur)', () => {
      expect(primaryAction(facts({ status: 'sent_mise_dispo', hasValidLink: true }))).toBeNull();
    });

    it('en cours : restitution par email ou au guichet, déclaration de non-restitution ; pas d’annulation', () => {
      const f = facts({ status: 'active' });
      expect(actionsOf(f)).toEqual(['start_restitution', 'restitution_in_person', 'declare_not_returned']);
      expect(actionBlockedReason('cancel', f)).toMatch(/plus être annulé/);
    });

    it('compte désactivé en cours de prêt : restitution par email bloquée, guichet proposé', () => {
      const f = facts({ status: 'active', canSendLink: false, linkRefusalMessage: 'Compte désactivé.' });
      expect(actionBlockedReason('start_restitution', f)).toBe('Compte désactivé.');
      expect(actionBlockedReason('restitution_in_person', f)).toBeNull();
    });

    it('restitution à signer : renvoyer, guichet, annuler le marquage, clôturer sans signature', () => {
      const f = facts({ status: 'sent_restitution', equipmentOut: 0, returnedToSign: 3 });
      expect(actionsOf(f)).toEqual(['resend', 'show_in_person_link', 'undo_return', 'close_without_signature']);
    });

    it('PV à signer : renvoyer, PV sur place, équipement retrouvé, clôturer sans signature', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 0, returnedSigned: 2, notReturned: 1 });
      expect(actionsOf(f)).toEqual(['resend', 'show_in_person_link', 'mark_found', 'close_without_signature']);
    });

    it('clôturer sans signature est refusé tant que du matériel est dehors', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 1, returnedToSign: 2 });
      expect(actionBlockedReason('close_without_signature', f)).toMatch(/encore chez le collaborateur/);
    });

    it('clôturé avec un équipement perdu : seul « équipement retrouvé » reste', () => {
      const f = facts({ status: 'archived', equipmentOut: 0, returnedSigned: 2, notReturned: 1 });
      expect(actionsOf(f)).toEqual(['mark_found']);
    });

    it('contesté ou annulé : aucune action', () => {
      expect(actionsOf(facts({ status: 'contested' }))).toEqual([]);
      expect(actionsOf(facts({ status: 'cancelled' }))).toEqual([]);
    });
  });

  describe('bon rouvert après une contestation Fondée (correction à faire)', () => {
    it('restitution contestée : corriger le marquage passe avant le renvoi du lien', () => {
      const f = facts({ status: 'sent_restitution', equipmentOut: 0, returnedToSign: 3 });
      expect(primaryAction(f, { correction: 'restitution' })).toBe('undo_return');
      const list = availableActions(f, { correction: 'restitution' });
      expect(list[0]).toEqual({ action: 'undo_return', primary: true, blockedReason: null });
      expect(list.find((a) => a.action === 'resend')?.primary).toBe(false);
    });

    it('PV contesté : « équipement retrouvé » passe en tête', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 0, returnedSigned: 2, notReturned: 1 });
      expect(primaryAction(f, { correction: 'pv_cloture' })).toBe('mark_found');
    });

    it('sans correction en cours, rien ne change', () => {
      const f = facts({ status: 'sent_restitution', equipmentOut: 0, returnedToSign: 3 });
      expect(primaryAction(f, { correction: null })).toBe('resend');
    });

    it('la correction ne s’applique qu’au document réellement en attente', () => {
      const f = facts({ status: 'partially_returned', equipmentOut: 0, returnedSigned: 2, notReturned: 1 });
      expect(primaryAction(f, { correction: 'restitution' })).toBe('resend');
    });
  });

  describe('statut suivant', () => {
    it('après un marquage : tout rendu → restitution à signer ; une partie → restitution en cours', () => {
      expect(statusAfterReturnChange({ equipmentCount: 3, equipmentOut: 0, returnedToSign: 3, notReturned: 0 }))
        .toBe('sent_restitution');
      expect(statusAfterReturnChange({ equipmentCount: 3, equipmentOut: 1, returnedToSign: 2, notReturned: 0 }))
        .toBe('partially_returned');
      expect(statusAfterReturnChange({ equipmentCount: 3, equipmentOut: 0, returnedToSign: 2, notReturned: 1 }))
        .toBe('partially_returned');
    });

    it('après l’annulation de tout marquage : le bon redevient « En cours »', () => {
      expect(statusAfterReturnChange({ equipmentCount: 3, equipmentOut: 3, returnedToSign: 0, notReturned: 0 }))
        .toBe('active');
    });

    it('signatures du collaborateur', () => {
      expect(statusAfterSignature('sent_mise_dispo', 'mise_disposition', false)).toBe('active');
      expect(statusAfterSignature('sent_restitution', 'restitution', false)).toBe('archived');
      expect(statusAfterSignature('sent_restitution', 'restitution', true)).toBe('partially_returned');
      expect(statusAfterSignature('partially_returned', 'restitution', false)).toBe('partially_returned');
      expect(statusAfterSignature('partially_returned', 'pv_cloture', true)).toBe('archived');
    });

    it('signature hors de son statut : aucune transition', () => {
      expect(statusAfterSignature('active', 'restitution', false)).toBeNull();
      expect(statusAfterSignature('archived', 'pv_cloture', false)).toBeNull();
    });
  });
});
