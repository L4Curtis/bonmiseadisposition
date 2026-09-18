import { groupInventoryByCollaborateur, sortCollaborateurGroups, CollaborateurGroupRow } from '../inventory-collaborateur-aggregate';

function makeRow(overrides: Partial<CollaborateurGroupRow['bon']> = {}): CollaborateurGroupRow {
  return {
    bon: {
      dateMiseDisposition: new Date('2026-01-10'),
      dateRestitution: new Date('2026-06-01'),
      collaborateur: { id: 'u-1', displayName: 'Jean Dupont', email: 'j.dupont@x.fr', department: 'IT' },
      filiale: { id: 'f-1', displayName: 'Paris' },
      ...overrides,
    },
  } as CollaborateurGroupRow;
}

describe('groupInventoryByCollaborateur', () => {
  it('regroupe plusieurs lignes du même collaborateur en un seul item, avec le bon compte', () => {
    const rows = [makeRow(), makeRow(), makeRow({ collaborateur: { id: 'u-2', displayName: 'Alice Martin', email: 'a@x.fr', department: 'RH' } })];

    const result = groupInventoryByCollaborateur(rows);

    expect(result).toHaveLength(2);
    const jean = result.find((r) => r.collaborateurId === 'u-1');
    expect(jean?.count).toBe(2);
    expect(jean?.displayName).toBe('Jean Dupont');
    expect(jean?.email).toBe('j.dupont@x.fr');
    expect(jean?.department).toBe('IT');
  });

  it('renvoie la filiale commune quand tout le matériel du collaborateur en provient', () => {
    const rows = [makeRow(), makeRow()];
    const [result] = groupInventoryByCollaborateur(rows);
    expect(result.filiale).toEqual({ id: 'f-1', displayName: 'Paris' });
  });

  it('renvoie une filiale nulle quand le matériel du collaborateur provient de filiales différentes', () => {
    const rows = [
      makeRow({ filiale: { id: 'f-1', displayName: 'Paris' } }),
      makeRow({ filiale: { id: 'f-2', displayName: 'Lyon' } }),
    ];
    const [result] = groupInventoryByCollaborateur(rows);
    expect(result.filiale).toBeNull();
  });

  it('compte les retards indépendamment du total, en excluant les dateRestitution nulles ou futures', () => {
    const now = new Date('2026-09-18T10:00:00.000Z');
    const rows = [
      makeRow({ dateRestitution: new Date('2026-09-01T00:00:00.000Z') }), // en retard
      makeRow({ dateRestitution: new Date('2026-12-01T00:00:00.000Z') }), // pas en retard
      makeRow({ dateRestitution: null }), // pas de restitution prévue
    ];

    const [result] = groupInventoryByCollaborateur(rows, now);

    expect(result.count).toBe(3);
    expect(result.overdueCount).toBe(1);
  });

  it('retient la date de mise à disposition la plus ancienne et calcule son ancienneté depuis `now`', () => {
    const now = new Date('2026-09-18T10:00:00.000Z');
    const rows = [
      makeRow({ dateMiseDisposition: new Date('2026-09-01T00:00:00.000Z') }), // 17 j
      makeRow({ dateMiseDisposition: new Date('2026-01-05T00:00:00.000Z') }), // le plus ancien
      makeRow({ dateMiseDisposition: new Date('2026-08-01T00:00:00.000Z') }),
    ];

    const [result] = groupInventoryByCollaborateur(rows, now);

    expect(result.oldestDateMiseDisposition).toEqual(new Date('2026-01-05T00:00:00.000Z'));
    expect(result.oldestAgeDays).toBe(256);
  });

  it('renvoie un tableau vide quand aucune ligne ne correspond', () => {
    expect(groupInventoryByCollaborateur([])).toEqual([]);
  });
});

describe('sortCollaborateurGroups', () => {
  const alice = { collaborateurId: 'u-2', displayName: 'Alice Martin', email: null, department: null, filiale: null, count: 5, overdueCount: 0, oldestDateMiseDisposition: new Date('2026-03-01'), oldestAgeDays: 10 };
  const jean = { collaborateurId: 'u-1', displayName: 'Jean Dupont', email: null, department: null, filiale: null, count: 5, overdueCount: 0, oldestDateMiseDisposition: new Date('2026-01-05'), oldestAgeDays: 100 };
  const zoe = { collaborateurId: 'u-3', displayName: 'Zoé Petit', email: null, department: null, filiale: null, count: 9, overdueCount: 2, oldestDateMiseDisposition: new Date('2026-06-01'), oldestAgeDays: 5 };

  it('trie par "count" décroissant par défaut, égalité départagée par ordre alphabétique du nom', () => {
    const result = sortCollaborateurGroups([alice, jean, zoe]);
    expect(result.map((r) => r.collaborateurId)).toEqual(['u-3', 'u-2', 'u-1']);
  });

  it('trie par "oldest" (prêt le plus ancien en premier, oldestDateMiseDisposition croissant)', () => {
    const result = sortCollaborateurGroups([alice, jean, zoe], 'oldest');
    expect(result.map((r) => r.collaborateurId)).toEqual(['u-1', 'u-2', 'u-3']);
  });

  it('ne mute pas le tableau reçu en entrée', () => {
    const input = [zoe, alice, jean];
    const copy = [...input];
    sortCollaborateurGroups(input, 'oldest');
    expect(input).toEqual(copy);
  });
});
