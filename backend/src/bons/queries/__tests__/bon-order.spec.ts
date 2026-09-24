import { buildBonOrderBy, BON_SORT_FIELDS, DEFAULT_BON_SORT } from '../bon-order';

describe('buildBonOrderBy', () => {
  it('trie par défaut du plus récent au plus ancien, départagé par id', () => {
    expect(buildBonOrderBy()).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(DEFAULT_BON_SORT).toEqual({ sort: 'createdAt', order: 'desc' });
  });

  it.each([
    ['reference', { reference: 'asc' }],
    ['dateMiseDisposition', { dateMiseDisposition: 'asc' }],
    ['createdAt', { createdAt: 'asc' }],
    ['updatedAt', { updatedAt: 'asc' }],
    ['status', { status: 'asc' }],
    ['collaborateur', { collaborateur: { displayName: 'asc' } }],
    ['filiale', { filiale: { displayName: 'asc' } }],
  ] as const)('trie sur %s puis départage par id dans le même sens', (sort, primary) => {
    expect(buildBonOrderBy(sort, 'asc')).toEqual([primary, { id: 'asc' }]);
  });

  it('inverse aussi le départage quand le tri est descendant (liste exactement inversée)', () => {
    expect(buildBonOrderBy('status', 'desc')).toEqual([{ status: 'desc' }, { id: 'desc' }]);
  });

  it('couvre chaque champ de la liste blanche', () => {
    for (const field of BON_SORT_FIELDS) {
      const orderBy = buildBonOrderBy(field, 'asc');
      expect(orderBy).toHaveLength(2);
      expect(orderBy[1]).toEqual({ id: 'asc' });
    }
  });
});
