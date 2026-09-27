import { equipmentHolding } from '../equipment-holding';

describe('equipmentHolding — où est l’équipement d’après une ligne de bon', () => {
  const base = { returnedAt: null, notReturned: false };

  it.each([
    ['draft', 'planned'],
    ['sent_mise_dispo', 'handover_to_sign'],
    ['active', 'with_collaborateur'],
    ['partially_returned', 'with_collaborateur'],
    ['contested', 'with_collaborateur'],
    ['cancelled', 'cancelled'],
    ['archived', 'closed'],
  ] as const)('bon %s, équipement ni rendu ni perdu → %s', (status, expected) => {
    expect(equipmentHolding({ ...base, bonStatus: status })).toBe(expected);
  });

  it('un équipement rendu est « returned », quel que soit le statut du bon', () => {
    expect(equipmentHolding({ returnedAt: new Date(), notReturned: false, bonStatus: 'sent_restitution' })).toBe('returned');
  });

  it('un équipement déclaré non restitué l’est même sur un bon clôturé', () => {
    expect(equipmentHolding({ returnedAt: null, notReturned: true, bonStatus: 'archived' })).toBe('not_returned');
  });

  it('un brouillon n’a jamais de détenteur, même avec une date de remise passée', () => {
    expect(equipmentHolding({ ...base, bonStatus: 'draft' })).not.toBe('with_collaborateur');
  });
});
