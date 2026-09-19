import { buildLdapClientOptions } from '../ldap-connection';

describe('buildLdapClientOptions', () => {
  it('applies safe tlsOptions (rejectUnauthorized: true) for an ldaps:// URL (cas nominal)', () => {
    const options = buildLdapClientOptions('ldaps://dc.test.local:636', 'false');

    expect(options.url).toBe('ldaps://dc.test.local:636');
    expect(options.tlsOptions).toEqual({ rejectUnauthorized: true });
  });

  it('leaves tlsOptions undefined for a consistent plain ldap:// URL', () => {
    const options = buildLdapClientOptions('ldap://dc.test.local', 'false');

    expect(options.tlsOptions).toBeUndefined();
  });

  it('throws when use_ssl=true but the URL is not ldaps:// (incohérence dangereuse, cas limite)', () => {
    expect(() => buildLdapClientOptions('ldap://dc.test.local', 'true')).toThrow('ldaps://');
  });

  it('does not throw when use_ssl=false even though the URL is ldaps:// (le chiffrement vient de l\'URL)', () => {
    expect(() => buildLdapClientOptions('ldaps://dc.test.local:636', 'false')).not.toThrow();
  });
});
