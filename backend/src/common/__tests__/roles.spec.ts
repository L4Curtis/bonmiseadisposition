import { IT_ROLES, isItRole } from '../roles';

describe('roles', () => {
  it('IT_ROLES contient exactement admin et technician', () => {
    expect(IT_ROLES).toEqual(['admin', 'technician']);
  });

  describe('isItRole', () => {
    it.each(['admin', 'technician'])('renvoie true pour %s', (role) => {
      expect(isItRole(role)).toBe(true);
    });

    it.each(['collaborator', 'direction', 'unknown'])('renvoie false pour %s', (role) => {
      expect(isItRole(role)).toBe(false);
    });
  });
});
