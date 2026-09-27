import { mapCollaborateurBons } from '../bon-mappers';

describe('mapCollaborateurBons', () => {
  const now = Date.now();

  it('keeps the token of a signable, non in-person signature', () => {
    const bons = [
      {
        id: 'bon-001',
        signatures: [
          { signed: false, type: 'mise_disposition', isInPerson: false, tokenExpiresAt: new Date(now + 10_000), token: 'remote-token' },
        ],
      },
    ];

    const result = mapCollaborateurBons(bons, now);

    expect(result[0].signatures[0]).toMatchObject({ token: 'remote-token' });
    expect(result[0].signatures[0]).not.toHaveProperty('inPersonPending');
  });

  it('masks the token and exposes inPersonPending for a pending in-person signature', () => {
    const bons = [
      {
        id: 'bon-002',
        signatures: [
          { signed: false, type: 'mise_disposition', isInPerson: true, tokenExpiresAt: new Date(now + 10_000), token: 'secret-token' },
        ],
      },
    ];

    const result = mapCollaborateurBons(bons, now);

    const sig = result[0].signatures[0] as { token?: string; inPersonPending?: boolean };
    expect(sig.token).toBeUndefined();
    expect(sig.inPersonPending).toBe(true);
  });

  it('masks the token of an already-signed signature', () => {
    const bons = [
      {
        id: 'bon-003',
        signatures: [
          { signed: true, type: 'mise_disposition', isInPerson: false, tokenExpiresAt: new Date(now + 10_000), token: 'used-token' },
        ],
      },
    ];

    const result = mapCollaborateurBons(bons, now);
    expect((result[0].signatures[0] as { token?: string }).token).toBeUndefined();
  });

  it('garde le jeton du DERNIER lien email expiré (« Demander un nouveau lien »), masque les plus anciens', () => {
    const bons = [
      {
        id: 'bon-004',
        signatures: [
          { signed: false, type: 'restitution', isInPerson: false, tokenExpiresAt: new Date(now - 20_000), createdAt: new Date(now - 90_000), token: 'old-token' },
          { signed: false, type: 'restitution', isInPerson: false, tokenExpiresAt: new Date(now - 10_000), createdAt: new Date(now - 50_000), token: 'expired-token' },
        ],
      },
    ];

    const [bon] = mapCollaborateurBons(bons, now);
    expect((bon.signatures[0] as { token?: string }).token).toBeUndefined();
    expect((bon.signatures[1] as { token?: string }).token).toBe('expired-token');
  });

  it('masque le jeton d’un lien invalidé (bon modifié, annulé…), même récent', () => {
    const bons = [
      {
        id: 'bon-006',
        signatures: [
          { signed: false, type: 'mise_disposition', isInPerson: false, tokenExpiresAt: new Date(0), invalidatedAt: new Date(now - 1000), token: 'invalid-token' },
        ],
      },
    ];
    expect((mapCollaborateurBons(bons, now)[0].signatures[0] as { token?: string }).token).toBeUndefined();
  });

  it('never exposes the token of the internal it_cachet signature', () => {
    const bons = [
      {
        id: 'bon-005',
        signatures: [
          { signed: false, type: 'it_cachet', isInPerson: false, tokenExpiresAt: new Date(now + 10_000), token: 'it-token' },
        ],
      },
    ];

    const result = mapCollaborateurBons(bons, now);
    expect((result[0].signatures[0] as { token?: string }).token).toBeUndefined();
  });
});
