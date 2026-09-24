import { Logger } from '@nestjs/common';
import { parseLdapSearchEntry } from '../ldap-entry-parser';

function fakeEntry(attrs: Array<{ type: string; vals: string[] }>): unknown {
  return { attributes: attrs };
}

describe('parseLdapSearchEntry', () => {
  const logger = { debug: vi.fn(), warn: vi.fn(), log: vi.fn() } as unknown as Logger;

  beforeEach(() => vi.clearAllMocks());

  it('parses a well-formed entry into an LdapUser (cas nominal)', () => {
    const entry = fakeEntry([
      { type: 'samaccountname', vals: ['jdupont'] },
      { type: 'displayname', vals: ['Jean Dupont'] },
      { type: 'mail', vals: ['jean.dupont@exemple.fr'] },
      { type: 'department', vals: ['IT'] },
      { type: 'company', vals: ['Livio'] },
      { type: 'title', vals: ['Technicien'] },
    ]);

    const result = parseLdapSearchEntry(entry, logger);

    expect(result.user).toEqual({
      sAMAccountName: 'jdupont',
      displayName: 'Jean Dupont',
      mail: 'jean.dupont@exemple.fr',
      department: 'IT',
      company: 'Livio',
      title: 'Technicien',
    });
  });

  it('falls back to userPrincipalName when mail is absent', () => {
    const entry = fakeEntry([
      { type: 'samaccountname', vals: ['jdupont'] },
      { type: 'displayname', vals: ['Jean Dupont'] },
      { type: 'userprincipalname', vals: ['jean.dupont@exemple.fr'] },
    ]);

    const result = parseLdapSearchEntry(entry, logger);

    expect(result.user?.mail).toBe('jean.dupont@exemple.fr');
  });

  it('skips an entry with no attributes at all (noObj)', () => {
    const result = parseLdapSearchEntry(fakeEntry([]), logger);
    expect(result.skipped).toBe('noObj');
  });

  it('skips an entry without sAMAccountName (noSam)', () => {
    const entry = fakeEntry([{ type: 'mail', vals: ['x@exemple.fr'] }]);
    const result = parseLdapSearchEntry(entry, logger);
    expect(result.skipped).toBe('noSam');
  });

  it('skips an entry without mail nor userPrincipalName (noMail)', () => {
    const entry = fakeEntry([{ type: 'samaccountname', vals: ['jdupont'] }]);
    const result = parseLdapSearchEntry(entry, logger);
    expect(result.skipped).toBe('noMail');
  });

  it('skips a machine account (sAMAccountName ending with $) as "other"', () => {
    const entry = fakeEntry([
      { type: 'samaccountname', vals: ['WORKSTATION1$'] },
      { type: 'mail', vals: ['x@exemple.fr'] },
      { type: 'displayname', vals: ['Workstation'] },
    ]);
    const result = parseLdapSearchEntry(entry, logger);
    expect(result.skipped).toBe('other');
  });

  it('skips an entry with an empty displayName as "other" (compte système)', () => {
    const entry = fakeEntry([
      { type: 'samaccountname', vals: ['svc_backup'] },
      { type: 'mail', vals: ['svc@exemple.fr'] },
      { type: 'displayname', vals: [''] },
    ]);
    const result = parseLdapSearchEntry(entry, logger);
    expect(result.skipped).toBe('other');
  });

  it('skips a non-routable internal domain (.local) as "other" (cas limite)', () => {
    const entry = fakeEntry([
      { type: 'samaccountname', vals: ['jdupont'] },
      { type: 'displayname', vals: ['Jean Dupont'] },
      { type: 'mail', vals: ['jean.dupont@ad.local'] },
    ]);
    const result = parseLdapSearchEntry(entry, logger);
    expect(result.skipped).toBe('other');
  });
});
