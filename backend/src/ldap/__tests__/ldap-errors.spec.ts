import { translateLdapConnectionError } from '../ldap-errors';

// Fabrique une erreur Node/ldapjs minimale portant les champs inspectés par
// la traduction (code TLS ou code protocolaire LDAP), sans dépendre de
// ldapjs ni du module tls réels.
function fakeError(message: string, extra?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

describe('translateLdapConnectionError', () => {
  describe('CA interne non approuvée', () => {
    it.each([
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
    ])('traduit %s en message actionnable sur la CA interne', (code) => {
      const err = fakeError('unable to verify the first certificate', { code });

      const message = translateLdapConnectionError(err);

      expect(message).toContain('autorité de certification');
      expect(message).toContain('NODE_EXTRA_CA_CERTS');
      expect(message).toContain('deploy/README.md');
      // Le détail technique brut ne doit pas fuiter dans le message utilisateur
      expect(message).not.toContain('unable to verify the first certificate');
    });
  });

  it('traduit ERR_TLS_CERT_ALTNAME_INVALID en indication d\'utiliser le FQDN', () => {
    const err = fakeError("Hostname/IP does not match certificate's altnames", {
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    });

    const message = translateLdapConnectionError(err);

    expect(message).toContain('FQDN');
    expect(message).toContain('IP');
  });

  it('traduit CERT_HAS_EXPIRED en indication de certificat expiré', () => {
    const err = fakeError('certificate has expired', { code: 'CERT_HAS_EXPIRED' });

    const message = translateLdapConnectionError(err);

    expect(message).toContain('expiré');
  });

  describe('strongerAuthRequired (code LDAP 8)', () => {
    it('traduit une erreur ldapjs par code numérique', () => {
      const err = fakeError('Strong Auth Required', { code: 8, name: 'StrongAuthRequiredError' });

      const message = translateLdapConnectionError(err);

      expect(message).toContain('ldaps://');
      expect(message).toContain('signée');
    });

    it('traduit aussi via le nom d\'erreur si le code numérique est absent', () => {
      const err = fakeError('stronger auth required', { name: 'StrongerAuthRequiredError' });

      const message = translateLdapConnectionError(err);

      expect(message).toContain('ldaps://');
    });
  });

  describe('connexion refusée / délai dépassé', () => {
    it('traduit ECONNREFUSED', () => {
      const err = fakeError('connect ECONNREFUSED 10.0.0.5:636', { code: 'ECONNREFUSED' });

      const message = translateLdapConnectionError(err);

      expect(message).toContain('port');
      expect(message).toContain('636');
    });

    it('traduit ETIMEDOUT', () => {
      const err = fakeError('connect ETIMEDOUT 10.0.0.5:636', { code: 'ETIMEDOUT' });

      const message = translateLdapConnectionError(err);

      expect(message).toContain('pare-feu');
    });

    it("traduit l'erreur de timeout propre à ldapjs (pas de code, message dédié)", () => {
      const err = fakeError('connection timeout');

      const message = translateLdapConnectionError(err);

      expect(message).toContain('pare-feu');
    });
  });

  describe('erreurs non reconnues', () => {
    it('renvoie le message original tel quel (ex. identifiants invalides)', () => {
      const err = new Error('Invalid Credentials');

      expect(translateLdapConnectionError(err)).toBe('Invalid Credentials');
    });

    it('renvoie un message générique pour une valeur non-Error', () => {
      expect(translateLdapConnectionError('boom')).toBe('boom');
      expect(translateLdapConnectionError(undefined)).toBe('Erreur de connexion LDAP');
    });
  });
});
