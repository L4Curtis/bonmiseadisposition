import { validateLdapFilterInput } from '../ldap-filter-validator';

describe('validateLdapFilterInput', () => {
  it('accepts a well-formed filter (cas nominal)', () => {
    expect(() => validateLdapFilterInput('(objectClass=person)')).not.toThrow();
  });

  it('rejects an empty filter', () => {
    expect(() => validateLdapFilterInput('')).toThrow('Filtre LDAP manquant');
  });

  it('rejects a filter longer than 512 characters', () => {
    const longFilter = '(' + 'a'.repeat(512) + ')';
    expect(() => validateLdapFilterInput(longFilter)).toThrow('trop long');
  });

  it('rejects a filter containing a null byte', () => {
    expect(() => validateLdapFilterInput('(cn=\0admin)')).toThrow('caractère nul');
  });

  it('rejects disallowed characters', () => {
    expect(() => validateLdapFilterInput('(cn=test;DROP)')).toThrow('caractères non autorisés');
  });

  it('rejects a filter not starting with "("', () => {
    expect(() => validateLdapFilterInput('cn=test)')).toThrow('doit commencer par');
  });

  it('rejects unbalanced parentheses (missing closing)', () => {
    expect(() => validateLdapFilterInput('((cn=test)')).toThrow('parenthèses non équilibrées');
  });

  it('rejects unbalanced parentheses (extra closing)', () => {
    expect(() => validateLdapFilterInput('(cn=test))')).toThrow('parenthèses non équilibrées');
  });
});
