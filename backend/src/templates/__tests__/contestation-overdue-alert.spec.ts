import { buildContestationOverdueAlert } from '../contestation-overdue-alert';

describe('buildContestationOverdueAlert — relance des contestations à trancher', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  const items = [
    { bonId: 'b1', bonReference: 'BON-2026-0001', collaborateurName: 'Léa <Martin>', message: 'Numéro faux', createdAt: new Date('2026-09-15T10:00:00Z'), reviewerName: null },
    { bonId: 'b2', bonReference: 'BON-2026-0002', collaborateurName: 'Hugo', message: 'x'.repeat(300), createdAt: new Date('2026-09-10T10:00:00Z'), reviewerName: 'Théo Bernard' },
  ];

  it('lien direct vers chaque bon et vers la liste à traiter, avec l’ancienneté', () => {
    const { subject, html } = buildContestationOverdueAlert(items, { appUrl: 'https://bons.test', afterDays: 7, now });
    expect(subject).toBe('[CONTESTATIONS] 2 contestations attendent une décision depuis plus de 7 jours ouvrés');
    expect(html).toContain('https://bons.test/bons/b1');
    expect(html).toContain('https://bons.test/admin/contestations');
    expect(html).toContain('(10 j)');
    expect(html).toContain('Prise en charge par Théo Bernard');
    expect(html).toContain('Personne ne l’a prise en charge');
  });

  it('échappe les textes saisis et tronque les longs motifs', () => {
    const { html } = buildContestationOverdueAlert(items, { appUrl: 'https://bons.test', afterDays: 7, now });
    expect(html).not.toContain('Léa <Martin>');
    expect(html).toContain('x'.repeat(160) + '…');
    expect(html).not.toContain('x'.repeat(161));
  });

  it('une seule contestation : sujet au singulier', () => {
    expect(buildContestationOverdueAlert(items.slice(0, 1), { appUrl: 'https://bons.test', afterDays: 7, now }).subject).toBe(
      '[CONTESTATION] BON-2026-0001 attend une décision depuis plus de 7 jours ouvrés',
    );
  });
});
