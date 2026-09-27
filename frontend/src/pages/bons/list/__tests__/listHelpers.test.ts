import { describe, it, expect } from 'vitest';
import { formatTimeAgo, daysSince } from '../relativeTime';
import { canResendLink, lastLinkSentAt } from '../resendEligibility';
import { buildQuickViews, findActiveView } from '../quickViews';
import { DEFAULT_LIST_QUERY } from '../bonsListQuery';
import { toReport } from '../useResendLinks';

const NOW = new Date('2026-09-24T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('formatTimeAgo', () => {
  it.each([
    [10_000, 'à l’instant'],
    [25 * MIN, 'il y a 25 min'],
    [3 * 60 * MIN, 'il y a 3 h'],
    [12 * DAY, 'il y a 12 j'],
    [59 * DAY, 'il y a 59 j'],
    [125 * DAY, 'il y a 4 mois'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatTimeAgo(ago(ms), NOW)).toBe(expected);
  });

  it('traite une date future comme « à l’instant »', () => {
    expect(formatTimeAgo(new Date(NOW + DAY).toISOString(), NOW)).toBe('à l’instant');
  });

  it('daysSince compte les jours pleins', () => {
    expect(daysSince(ago(DAY * 2 + 5 * MIN), NOW)).toBe(2);
  });
});

describe('canResendLink', () => {
  const pending = { type: 'mise_disposition' as const, expired: true, inPerson: false, itSigned: true, sentAt: '2026-09-10T00:00:00.000Z', expiresAt: null };

  it('autorise un bon dont un document attend la signature, signé par l’IT, vers une adresse joignable', () => {
    expect(canResendLink({ pendingSignature: pending, canSendLink: true })).toBe(true);
    expect(canResendLink({ pendingSignature: { ...pending, type: 'restitution' }, canSendLink: true })).toBe(true);
  });

  it('refuse quand aucun email ne peut partir (compte désactivé, pas d’adresse)', () => {
    expect(canResendLink({ pendingSignature: pending, canSendLink: false })).toBe(false);
  });

  it('refuse quand rien n’attend la signature du collaborateur', () => {
    expect(canResendLink({ pendingSignature: null, canSendLink: true })).toBe(false);
  });

  it('refuse sans la signature IT du document : elle se pose depuis la fiche', () => {
    expect(canResendLink({ pendingSignature: { ...pending, itSigned: false }, canSendLink: true })).toBe(false);
  });

  it('lastLinkSentAt lit la date du dernier lien calculée par le serveur', () => {
    expect(lastLinkSentAt({ pendingSignature: null })).toBeNull();
    expect(lastLinkSentAt({ pendingSignature: pending })).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('vues rapides', () => {
  it('propose « Mes brouillons » seulement si l’utilisateur est connu', () => {
    expect(buildQuickViews(undefined).map((v) => v.id)).not.toContain('my-drafts');
    const mine = buildQuickViews('u1').find((v) => v.id === 'my-drafts');
    expect(mine?.query).toEqual(expect.objectContaining({ status: 'draft', createdById: 'u1' }));
  });

  it('reconnaît la vue active (page ignorée), et aucune sinon', () => {
    const views = buildQuickViews('u1');
    const overdue = views.find((v) => v.id === 'overdue');
    expect(overdue).toBeDefined();
    if (!overdue) return;
    expect(findActiveView(views, { ...overdue.query, page: 3 })?.id).toBe('overdue');
    expect(findActiveView(views, DEFAULT_LIST_QUERY)).toBeUndefined();
    expect(findActiveView(views, { ...overdue.query, search: 'x' })).toBeUndefined();
  });
});

describe('toReport', () => {
  it('répartit les résultats en envoyés / ignorés / en échec', () => {
    const report = toReport([
      { id: 'a', outcome: 'sent' },
      { id: 'b', outcome: 'skipped', reason: 'x' },
      { id: 'c', outcome: 'failed' },
      { id: 'd', outcome: 'sent' },
    ]);
    expect(report.sent.map((r) => r.id)).toEqual(['a', 'd']);
    expect(report.skipped.map((r) => r.id)).toEqual(['b']);
    expect(report.failed.map((r) => r.id)).toEqual(['c']);
  });
});
