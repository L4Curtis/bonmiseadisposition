import { describe, expect, it } from 'vitest';
import type { BonActionName, BonAvailableAction, PendingSignature } from '@/contracts';
import { placeActions } from '../action-placement';
import { actionLabel, nextStepSentence } from '../bon-lexicon';
import { bonFiche, equipment } from './fixtures';

const act = (action: BonActionName, primary = false): BonAvailableAction => ({ action, primary, blockedReason: null });
const names = (list: readonly BonAvailableAction[]) => list.map((a) => a.action);

const restitutionPending = (overrides: Partial<PendingSignature> = {}): PendingSignature => ({
  type: 'restitution', expired: false, inPerson: false, itSigned: true,
  sentAt: '2026-09-27T12:31:00.000Z', expiresAt: '2026-10-04T12:31:00.000Z', ...overrides,
});

/** Restitution partielle envoyée par email (IMD n° 8, S17). */
const partialRestitution = [
  act('resend'), act('show_in_person_link'), act('start_restitution'), act('restitution_in_person'),
  act('undo_return'), act('declare_not_returned'), act('close_without_signature'),
];

describe('placeActions — une seule action claire', () => {
  it('restitution en attente, lien valide : seul « Faire signer sur place » reste visible', () => {
    const placed = placeActions(bonFiche({
      status: 'partially_returned', pendingSignature: restitutionPending(), availableActions: partialRestitution,
    }));
    expect(placed.primary).toBeNull();
    expect(names(placed.inline)).toEqual(['show_in_person_link']);
    expect(names(placed.more)).toEqual([
      'resend', 'start_restitution', 'restitution_in_person', 'undo_return', 'declare_not_returned', 'close_without_signature',
    ]);
  });

  it('restitution en attente, lien expiré : « Renvoyer » en tête, le guichet à côté, les nouvelles restitutions rangées', () => {
    const placed = placeActions(bonFiche({
      status: 'partially_returned',
      pendingSignature: restitutionPending({ expired: true }),
      availableActions: [act('resend', true), ...partialRestitution.slice(1)],
    }));
    expect(placed.primary?.action).toBe('resend');
    expect(names(placed.inline)).toEqual(['show_in_person_link']);
    expect(names(placed.more)).toContain('restitution_in_person');
  });

  it('correction après une contestation Fondée : relancer la signature ne se propose pas à côté de la correction', () => {
    const placed = placeActions(bonFiche({
      status: 'sent_restitution',
      pendingSignature: restitutionPending({ expired: true, itSigned: false }),
      availableActions: [act('undo_return', true), act('resend'), act('show_in_person_link'), act('close_without_signature')],
      contestation: {
        id: 'c1', stage: 'correction', message: 'Souris gardée', createdAt: '2026-09-27T10:00:00.000Z',
        contestedDocument: 'restitution', reviewedBy: null, resolvedAt: '2026-09-27T11:00:00.000Z', resolutionMessage: null,
      },
    }));
    expect(placed.primary?.action).toBe('undo_return');
    expect(placed.inline).toEqual([]);
    expect(names(placed.more)).toEqual(['resend', 'show_in_person_link', 'close_without_signature']);
  });

  it('rien n’attend de signature : restitution et déclaration restent visibles', () => {
    const placed = placeActions(bonFiche({
      status: 'active',
      availableActions: [act('start_restitution'), act('restitution_in_person'), act('declare_not_returned')],
    }));
    expect(names(placed.inline)).toEqual(['start_restitution', 'restitution_in_person', 'declare_not_returned']);
    expect(placed.more).toEqual([]);
  });
});

describe('libellés et phrase de la fiche', () => {
  it('correction après une contestation Fondée : « Corriger le marquage »', () => {
    const bon = bonFiche({
      status: 'sent_restitution',
      pendingSignature: restitutionPending({ expired: true, itSigned: false }),
      contestation: {
        id: 'c1', stage: 'correction', message: 'Souris gardée', createdAt: '2026-09-27T10:00:00.000Z',
        contestedDocument: 'restitution', reviewedBy: null, resolvedAt: '2026-09-27T11:00:00.000Z', resolutionMessage: null,
      },
    });
    expect(actionLabel('undo_return', bon)).toBe('Corriger le marquage');
    expect(nextStepSentence(bon)).toMatch(/corrigez la restitution/i);
  });

  it('correction d’un PV après une contestation Fondée : la phrase parle du PV, pas de la restitution', () => {
    const bon = bonFiche({
      status: 'partially_returned',
      pendingSignature: { type: 'pv_cloture', expired: true, inPerson: false, itSigned: true, sentAt: null, expiresAt: null },
      contestation: {
        id: 'c2', stage: 'correction', message: 'J’ai rendu l’écran', createdAt: '2026-09-27T10:00:00.000Z',
        contestedDocument: 'pv_cloture', reviewedBy: null, resolvedAt: '2026-09-27T11:00:00.000Z', resolutionMessage: null,
      },
    });
    const sentence = nextStepSentence(bon);
    expect(sentence).toMatch(/PV de non-restitution/);
    expect(sentence).toMatch(/Équipement retrouvé/);
    expect(sentence).not.toMatch(/corrigez la restitution/);
  });

  it('PV à signer jamais envoyé : « Envoyer le PV »', () => {
    const bon = bonFiche({ pendingSignature: { type: 'pv_cloture', expired: true, inPerson: false, itSigned: true, sentAt: null, expiresAt: null } });
    expect(actionLabel('resend', bon)).toBe('Envoyer le PV par email');
  });

  it('perte déclarée : dit où est le PV et quand il part', () => {
    const bon = bonFiche({
      status: 'partially_returned',
      subStatus: 'loss_declared',
      equipments: [
        equipment({ id: 'e1', returnState: 'out' }),
        equipment({ id: 'e2', returnState: 'out' }),
        equipment({ id: 'e3', returnState: 'not_returned', notReturned: true }),
      ],
    });
    expect(nextStepSentence(bon)).toMatch(/PV de non-restitution.*signature IT.*2 équipements/);
  });

  it('perte déclarée : nomme le technicien qui a certifié le PV, jamais « votre » signature', () => {
    const bon = bonFiche({
      status: 'partially_returned',
      subStatus: 'loss_declared',
      equipments: [equipment({ id: 'e1', returnState: 'out' }), equipment({ id: 'e2', returnState: 'not_returned', notReturned: true })],
      signatures: [{
        id: 'pv-it', type: 'it_cachet', signed: true, signedAt: '2026-06-19T21:53:00.000Z', signerEmail: 'julie@livio.fr',
        signerName: 'Julie Moreau', mentionLuApprouve: false, isInPerson: false, tokenExpiresAt: '2026-06-19T21:53:00.000Z',
        createdAt: '2026-06-19T21:53:00.000Z', pdfType: 'pv_cloture', invalidatedAt: null, invalidatedReason: null,
      }],
    });
    const sentence = nextStepSentence(bon);
    expect(sentence).toContain('déjà certifié par la signature IT de Julie Moreau');
    expect(sentence).not.toMatch(/votre signature/);
  });

  it('restitution en attente, lien valide : rien à faire, sauf si le collaborateur se présente', () => {
    const bon = bonFiche({ status: 'sent_restitution', pendingSignature: restitutionPending() });
    expect(nextStepSentence(bon)).toMatch(/au guichet/);
  });

  it('bon contesté : invite à trancher', () => {
    expect(nextStepSentence(bonFiche({ status: 'contested' }))).toMatch(/tranchez/);
  });
});
