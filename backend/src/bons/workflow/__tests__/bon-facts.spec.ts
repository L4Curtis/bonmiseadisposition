import { computeBonFacts, computePendingSignature, equipmentReturnState, FactsBon, FactsSignature, isItSignedFor } from '../bon-facts';

const NOW = new Date('2026-09-25T10:00:00Z').getTime();
const at = (iso: string) => new Date(iso);

function sig(overrides: Partial<FactsSignature> & { type: string }): FactsSignature {
  return {
    signed: false,
    signedAt: null,
    tokenExpiresAt: at('2026-10-01T00:00:00Z'),
    createdAt: at('2026-09-20T00:00:00Z'),
    isInPerson: false,
    pdfType: null,
    invalidatedAt: null,
    ...overrides,
  };
}

const collaborateur = { active: true, email: 'lea.martin@groupe.fr' };

describe('faits d’un bon', () => {
  it('un équipement marqué rendu après la dernière restitution signée attend sa signature', () => {
    const signedAt = at('2026-09-10T00:00:00Z').getTime();
    expect(equipmentReturnState({ returnedAt: at('2026-09-12T00:00:00Z'), notReturned: false }, signedAt, 'partially_returned'))
      .toBe('returned_to_sign');
    expect(equipmentReturnState({ returnedAt: at('2026-09-09T00:00:00Z'), notReturned: false }, signedAt, 'partially_returned'))
      .toBe('returned');
    expect(equipmentReturnState({ returnedAt: at('2026-09-12T00:00:00Z'), notReturned: false }, signedAt, 'archived'))
      .toBe('returned');
  });

  it('restitution partielle dont la ligne de signature a été purgée : la restitution reste en attente, lien « expiré »', () => {
    const bon: FactsBon = {
      status: 'partially_returned',
      collaborateur,
      equipments: [
        { returnedAt: at('2026-08-01T00:00:00Z'), notReturned: false },
        { returnedAt: null, notReturned: false },
      ],
      signatures: [sig({ type: 'mise_disposition', signed: true, signedAt: at('2026-07-01T00:00:00Z') })],
    };
    const facts = computeBonFacts(bon, NOW);
    expect(facts).toMatchObject({ returnedToSign: 1, equipmentOut: 1, hasValidLink: false });
    expect(computePendingSignature(bon, facts, NOW)).toEqual({
      type: 'restitution',
      expired: true,
      inPerson: false,
      itSigned: false,
      sentAt: null,
      expiresAt: null,
    });
  });

  it('lien présentiel expiré : signalé expiré, présentiel, avec sa date d’échéance', () => {
    const bon: FactsBon = {
      status: 'sent_mise_dispo',
      collaborateur,
      equipments: [{ returnedAt: null, notReturned: false }],
      signatures: [
        sig({ type: 'it_cachet', signed: true, signedAt: at('2026-09-19T00:00:00Z'), pdfType: 'mise_disposition' }),
        sig({ type: 'mise_disposition', isInPerson: true, tokenExpiresAt: at('2026-09-20T02:00:00Z') }),
      ],
    };
    const pending = computePendingSignature(bon, computeBonFacts(bon, NOW), NOW);
    expect(pending).toMatchObject({ type: 'mise_disposition', expired: true, inPerson: true, itSigned: true });
    expect(pending?.expiresAt).toBe('2026-09-20T02:00:00.000Z');
  });

  it('lien invalidé : aucun lien valide, pas d’échéance affichée', () => {
    const bon: FactsBon = {
      status: 'sent_mise_dispo',
      collaborateur,
      equipments: [{ returnedAt: null, notReturned: false }],
      signatures: [sig({ type: 'mise_disposition', tokenExpiresAt: at('1970-01-01T00:00:00Z'), invalidatedAt: at('2026-09-21T00:00:00Z') })],
    };
    const pending = computePendingSignature(bon, computeBonFacts(bon, NOW), NOW);
    expect(pending).toMatchObject({ expired: true, expiresAt: null });
  });

  it('compte désactivé : envoi de lien refusé avec le message de la règle unique', () => {
    const facts = computeBonFacts(
      { status: 'active', collaborateur: { active: false, email: 'paul@groupe.fr' }, equipments: [], signatures: [] },
      NOW,
    );
    expect(facts.canSendLink).toBe(false);
    expect(facts.linkRefusalMessage).toMatch(/désactivé/);
  });

  describe('signature IT du document en attente', () => {
    const marked = at('2026-09-22T00:00:00Z');
    const base: FactsBon = {
      status: 'sent_restitution',
      collaborateur,
      equipments: [{ returnedAt: marked, notReturned: false }],
      signatures: [],
    };

    it('restitution : exige une signature IT de restitution postérieure au marquage', () => {
      const before = sig({ type: 'it_cachet', signed: true, signedAt: at('2026-09-21T00:00:00Z'), pdfType: 'restitution' });
      const after = sig({ type: 'it_cachet', signed: true, signedAt: at('2026-09-22T00:01:00Z'), pdfType: 'restitution' });
      expect(isItSignedFor({ ...base, signatures: [before] }, 'restitution')).toBe(false);
      expect(isItSignedFor({ ...base, signatures: [after] }, 'restitution')).toBe(true);
    });

    it('une signature IT invalidée (bon modifié) ne compte plus', () => {
      const invalidated = sig({
        type: 'it_cachet', signed: true, signedAt: at('2026-09-19T00:00:00Z'), pdfType: 'mise_disposition',
        invalidatedAt: at('2026-09-20T00:00:00Z'),
      });
      expect(isItSignedFor({ ...base, status: 'sent_mise_dispo', signatures: [invalidated] }, 'mise_disposition')).toBe(false);
    });
  });
});
