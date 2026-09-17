import { resolveRoleFromGroups } from '../role-mapping';

describe('resolveRoleFromGroups (pure)', () => {
  const config = {
    adminGroupId: 'grp-admin',
    technicianGroupId: 'grp-tech',
    directionGroupId: 'grp-direction',
  };

  it('promeut admin quand le groupe admin est présent (priorité la plus haute)', () => {
    expect(resolveRoleFromGroups(['grp-admin', 'grp-tech', 'grp-direction'], config)).toEqual({
      role: 'admin',
      isItStaff: true,
    });
  });

  it('promeut technician quand seul le groupe technicien matche', () => {
    expect(resolveRoleFromGroups(['grp-tech', 'grp-direction'], config)).toEqual({
      role: 'technician',
      isItStaff: true,
    });
  });

  it('promeut direction (isItStaff:false) quand seul le groupe direction matche', () => {
    expect(resolveRoleFromGroups(['grp-direction'], config)).toEqual({
      role: 'direction',
      isItStaff: false,
    });
  });

  it('rétrograde en collaborator quand aucun groupe élevé ne matche', () => {
    expect(resolveRoleFromGroups(['grp-other'], config)).toEqual({
      role: 'collaborator',
      isItStaff: false,
    });
  });

  it('rétrograde en collaborator pour une liste de groupes vide (les groupes écrasent toujours le rôle)', () => {
    expect(resolveRoleFromGroups([], config)).toEqual({
      role: 'collaborator',
      isItStaff: false,
    });
  });

  it('ne matche jamais un groupe non configuré (null/undefined)', () => {
    expect(
      resolveRoleFromGroups(['grp-admin'], {
        adminGroupId: null,
        technicianGroupId: undefined,
        directionGroupId: null,
      }),
    ).toEqual({ role: 'collaborator', isItStaff: false });
  });
});
