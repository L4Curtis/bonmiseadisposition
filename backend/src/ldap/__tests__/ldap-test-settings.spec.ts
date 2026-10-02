import { describe, expect, it } from 'vitest';
import { resolveLdapTestSettings, type LdapConnectionSettings } from '../ldap-test-settings';

const stored: LdapConnectionSettings = {
  url: 'ldaps://dc01.livio.local:636',
  useSsl: true,
  bindDn: 'CN=svc-bons,OU=Services,DC=livio,DC=local',
  bindPassword: 'secret-enregistre',
  userFilter: null,
};

describe('resolveLdapTestSettings — le mot de passe enregistré ne part que vers le serveur enregistré', () => {
  it('même serveur et même compte (casse et espaces près) : le mot de passe enregistré est repris', () => {
    const settings = resolveLdapTestSettings(
      { url: ' LDAPS://DC01.livio.local:636 ', bind_dn: 'cn=svc-bons,ou=Services,dc=livio,dc=local', bind_password: '' },
      stored,
    );
    expect(settings.bindPassword).toBe('secret-enregistre');
    expect(settings.storedPasswordWithheld).toBe(false);
  });

  it('autre adresse de serveur : le mot de passe enregistré n’est pas envoyé', () => {
    const settings = resolveLdapTestSettings({ url: 'ldap://machine-inconnue:389' }, stored);
    expect(settings.bindPassword).toBeNull();
    expect(settings.storedPasswordWithheld).toBe(true);
  });

  it('autre compte de service : le mot de passe enregistré n’est pas envoyé', () => {
    const settings = resolveLdapTestSettings({ bind_dn: 'CN=autre,DC=livio,DC=local' }, stored);
    expect(settings.storedPasswordWithheld).toBe(true);
  });

  it('SSL désactivé alors qu’il est enregistré actif : le mot de passe ne passe pas en clair', () => {
    const settings = resolveLdapTestSettings({ use_ssl: 'false' }, stored);
    expect(settings.storedPasswordWithheld).toBe(true);
  });

  it('un mot de passe retapé est toujours utilisé, quel que soit le serveur', () => {
    const settings = resolveLdapTestSettings({ url: 'ldap://autre:389', bind_password: 'retape' }, stored);
    expect(settings.bindPassword).toBe('retape');
    expect(settings.storedPasswordWithheld).toBe(false);
  });
});
