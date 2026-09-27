import { describe, expect, it } from 'vitest';
import type { ContestationListItem } from '@/contracts/contestations';
import {
  contestationAgeDays,
  contestationFollowUpForIt,
  contestedDocumentLabel,
  foundedEffect,
  foundedOutcomeMessage,
  isOverdue,
} from '../contestation-meta';

const NOW = new Date('2026-09-25T10:00:00Z');

function item(extra: Partial<ContestationListItem> = {}): ContestationListItem {
  return {
    id: 'c1',
    bonId: 'b1',
    userId: 'u1',
    message: 'Écran cassé',
    status: 'open',
    previousBonStatus: 'active',
    contestedDocument: 'mise_disposition',
    outcome: null,
    reviewedById: null,
    reviewedAt: null,
    resolvedById: null,
    resolvedAt: null,
    resolutionMessage: null,
    createdAt: '2026-09-16T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
    user: { id: 'u1', displayName: 'Léa Martin', email: 'lea@example.test' },
    reviewedBy: null,
    resolvedBy: null,
    bon: { id: 'b1', reference: 'BON-2026-0021', status: 'contested', filiale: { displayName: 'Bâtir Nord' } },
    ...extra,
  };
}

describe('ancienneté et retard (R-053)', () => {
  // Seuil calculé par le serveur : 7 jours ouvrés avant maintenant.
  const OVERDUE_SINCE = '2026-09-16T10:00:00.000Z';

  it('reçue avant le seuil du serveur, non tranchée : en retard', () => {
    expect(contestationAgeDays(item().createdAt, NOW)).toBe(9);
    expect(isOverdue(item({ createdAt: '2026-09-16T09:59:00Z' }), OVERDUE_SINCE)).toBe(true);
  });

  it('reçue après le seuil : pas en retard, même au-delà de 7 jours de calendrier (week-ends exclus)', () => {
    expect(isOverdue(item({ createdAt: '2026-09-16T10:00:00Z' }), OVERDUE_SINCE)).toBe(false);
    expect(isOverdue(item({ createdAt: '2026-09-17T10:00:00Z' }), OVERDUE_SINCE)).toBe(false);
  });

  it('seuil inconnu (liste pas encore chargée) : jamais en retard', () => {
    expect(isOverdue(item(), null)).toBe(false);
  });

  it('tranchée : jamais en retard', () => {
    expect(isOverdue(item({ status: 'rejected', outcome: 'not_retained', createdAt: '2026-01-01T00:00:00Z' }), OVERDUE_SINCE)).toBe(false);
  });
});

describe('ce que fait « Fondée », selon le document contesté (décision du 26/09)', () => {
  it('remise : un bon corrigé remplace l’original', () => {
    expect(foundedEffect(item())).toMatch(/bon corrigé est créé/);
    expect(foundedEffect(item({ contestedDocument: null }))).toMatch(/bon corrigé est créé/);
  });

  it('restitution : le bon est corrigé, puis la restitution renvoyée à signer, sans nouveau bon', () => {
    const text = foundedEffect(item({ contestedDocument: 'restitution' }));
    expect(text).toMatch(/le bon va être corrigé, puis la restitution sera renvoyée à signer/i);
    expect(text).toMatch(/aucun nouveau bon/i);
  });

  it('PV : le bon est corrigé, puis le PV renvoyé à signer', () => {
    expect(foundedEffect(item({ contestedDocument: 'pv_cloture' }))).toMatch(
      /le bon va être corrigé, puis le PV de non-restitution sera renvoyé à signer/i,
    );
  });

  it('message après la décision : ce qu’il reste à faire à l’IT', () => {
    expect(foundedOutcomeMessage('BON-2026-0021', 'Léa Martin', { replacementBon: { reference: 'BON-2026-0042' }, reopenedDocument: null }))
      .toBe('Bon corrigé BON-2026-0042 créé : vérifiez-le puis envoyez-le à Léa Martin.');
    expect(foundedOutcomeMessage('BON-2026-0021', 'Léa Martin', { replacementBon: null, reopenedDocument: 'restitution' }))
      .toBe('Corrigez BON-2026-0021, puis renvoyez la restitution à signer à Léa Martin.');
    expect(foundedOutcomeMessage('BON-2026-0021', 'Léa Martin', { replacementBon: null, reopenedDocument: 'pv_cloture' }))
      .toBe('Corrigez BON-2026-0021, puis renvoyez le PV de non-restitution à signer à Léa Martin.');
  });
});

describe('suivi pour l’équipe informatique : « pris en charge par » distinct de « tranché par »', () => {
  it('nouvelle', () => {
    expect(contestationFollowUpForIt(item())).toBe('Nouvelle — personne ne l’a prise en charge');
  });

  it('prise en charge : par qui et quand', () => {
    expect(
      contestationFollowUpForIt(
        item({ status: 'in_review', reviewedBy: { id: 't', displayName: 'Thomas Girard' }, reviewedAt: '2026-09-17T08:00:00Z' }),
      ),
    ).toBe('Prise en charge par Thomas Girard le 17 septembre 2026');
  });

  it('tranchée : l’issue, par qui, quand', () => {
    expect(
      contestationFollowUpForIt(
        item({
          status: 'resolved',
          outcome: 'founded',
          reviewedBy: { id: 't', displayName: 'Thomas Girard' },
          resolvedBy: { id: 'a', displayName: 'Alice Admin' },
          resolvedAt: '2026-09-18T08:00:00Z',
        }),
      ),
    ).toBe('Fondée — tranchée par Alice Admin le 18 septembre 2026');
  });

  it('ancienne contestation sans issue enregistrée : déduite du statut', () => {
    expect(contestationFollowUpForIt(item({ status: 'rejected', updatedAt: '2026-09-18T08:00:00Z' }))).toBe(
      'Non retenue — tranchée le 18 septembre 2026',
    );
  });

  it('document contesté', () => {
    expect(contestedDocumentLabel(item({ contestedDocument: 'pv_cloture' }))).toBe('PV de non-restitution');
    expect(contestedDocumentLabel(item({ contestedDocument: null }))).toBe('Mise à disposition');
  });
});
