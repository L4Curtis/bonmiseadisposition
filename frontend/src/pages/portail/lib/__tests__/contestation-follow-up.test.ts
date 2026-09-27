import { describe, expect, it } from 'vitest';
import type { MyContestation } from '@/contracts/contestations';
import {
  contestationFollowUp,
  contestedDocumentPhrase,
  latestContestationByBon,
  outcomeExplanation,
} from '../contestation-follow-up';

function contestation(extra: Partial<MyContestation> = {}): MyContestation {
  return {
    id: 'c1',
    bon: { id: 'b1', reference: 'BON-2026-0021' },
    contestedDocument: 'mise_disposition',
    message: 'Le numéro de série ne correspond pas.',
    status: 'open',
    outcome: null,
    createdAt: '2026-09-16T10:00:00Z',
    reviewedAt: null,
    resolvedAt: null,
    resolutionMessage: null,
    replacementBon: null,
    ...extra,
  };
}

describe('suivi de sa contestation par le collaborateur (R-055)', () => {
  it('envoyée, personne ne l’a prise en charge : on le dit, avec la date', () => {
    expect(contestationFollowUp(contestation())).toEqual({
      tone: 'waiting',
      label: 'Envoyée le 16 septembre 2026 — pas encore prise en charge',
    });
  });

  it('prise en charge : date de prise en charge, sans nom de technicien', () => {
    const f = contestationFollowUp(contestation({ status: 'in_review', reviewedAt: '2026-09-18T08:00:00Z' }));
    expect(f.tone).toBe('in_progress');
    expect(f.label).toBe('Prise en charge le 18 septembre 2026 par l’équipe informatique');
  });

  it('tranchée : « Fondée » / « Non retenue », avec la date', () => {
    expect(
      contestationFollowUp(contestation({ status: 'resolved', outcome: 'founded', resolvedAt: '2026-09-20T08:00:00Z' })).label,
    ).toBe('Fondée le 20 septembre 2026');
    expect(
      contestationFollowUp(contestation({ status: 'rejected', outcome: 'not_retained', resolvedAt: '2026-09-20T08:00:00Z' })).label,
    ).toBe('Non retenue le 20 septembre 2026');
  });

  it('ce que la décision change', () => {
    expect(outcomeExplanation(contestation())).toBeNull();
    expect(outcomeExplanation(contestation({ outcome: 'not_retained' }))).toBe('Le bon reste tel quel.');
    expect(
      outcomeExplanation(contestation({ outcome: 'founded', replacementBon: { id: 'b2', reference: 'BON-2026-0070' } })),
    ).toContain('BON-2026-0070');
  });

  it('document contesté dans une phrase', () => {
    expect(contestedDocumentPhrase('mise_disposition')).toBe('la remise');
    expect(contestedDocumentPhrase(null)).toBe('la remise');
    expect(contestedDocumentPhrase('restitution')).toBe('la restitution');
    expect(contestedDocumentPhrase('pv_cloture')).toBe('le PV de non-restitution');
  });

  it('garde la plus récente par bon', () => {
    const old = contestation({ id: 'old', createdAt: '2026-08-01T00:00:00Z' });
    const recent = contestation({ id: 'recent' });
    expect(latestContestationByBon([old, recent]).get('b1')?.id).toBe('recent');
    expect(latestContestationByBon([recent, old]).get('b1')?.id).toBe('recent');
  });
});
