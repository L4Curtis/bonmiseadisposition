import { describe, it, expect } from 'vitest';
import { isSafeReturnTo, loginPathFor, safeReturnTo } from '../safe-return-to';

describe('isSafeReturnTo', () => {
  it('accepts a same-origin absolute path', () => {
    expect(isSafeReturnTo('/signer/tok-1')).toBe(true);
  });

  it('rejects a protocol-relative payload that resolves to another host', () => {
    expect(isSafeReturnTo('//evil.com')).toBe(false);
  });

  it('rejects a backslash payload normalized by the browser to another host', () => {
    expect(isSafeReturnTo('/\\evil.com')).toBe(false);
  });

  it('rejects an absolute URL to another origin', () => {
    expect(isSafeReturnTo('https://evil.com/phish')).toBe(false);
  });

  it('rejects a value that does not start with a slash', () => {
    expect(isSafeReturnTo('signer/tok-1')).toBe(false);
  });

  // Ces deux cas reproduisent au niveau de la fonction ce que
  // URLSearchParams#get produit réellement pour "?returnTo=/%09/evil.com" et
  // "?returnTo=/%0a/evil.com" : une tabulation ou un saut de ligne LITTÉRAL
  // dans la chaîne (le décodage %XX a déjà eu lieu avant l'appel). Le WHATWG
  // URL parser retire ensuite ce caractère de contrôle AVANT de parser le
  // reste, ce qui transforme "/\t/evil.com" en une référence réseau-relative
  // ("//evil.com", host = evil.com) — cf. Login.test.tsx pour le test de bout
  // en bout à partir du payload encodé tel qu'il apparaît dans l'URL d'attaque.
  it('rejects a literal tab control character normalized to another host', () => {
    expect(isSafeReturnTo('/\t/evil.com')).toBe(false);
  });

  it('rejects a literal newline control character normalized to another host', () => {
    expect(isSafeReturnTo('/\n/evil.com')).toBe(false);
  });

  it('accepte un chemin interne avec ses paramètres de recherche', () => {
    expect(isSafeReturnTo('/inventaire?vue=collaborateurs&compte=inactif')).toBe(true);
  });

  it('refuse une adresse plus longue que le plafond du serveur', () => {
    expect(isSafeReturnTo(`/${'a'.repeat(2047)}`)).toBe(true);
    expect(isSafeReturnTo(`/${'a'.repeat(2048)}`)).toBe(false);
  });

  it('refuse le caractère DEL, que le serveur refuse aussi', () => {
    expect(isSafeReturnTo('/bons\u007f')).toBe(false);
  });

  it('refuse un chemin qui commence par // même s’il semblait interne', () => {
    expect(isSafeReturnTo('///evil.com')).toBe(false);
  });
});

describe('safeReturnTo', () => {
  it('renvoie la valeur sûre, null sinon', () => {
    expect(safeReturnTo('/bons?status=active')).toBe('/bons?status=active');
    expect(safeReturnTo('//evil.com')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('encode le chemin et ses paramètres dans returnTo', () => {
    expect(loginPathFor('/inventaire?vue=collaborateurs&compte=inactif'))
      .toBe('/login?returnTo=%2Finventaire%3Fvue%3Dcollaborateurs%26compte%3Dinactif');
  });

  it('ne mémorise ni l’accueil ni la page de connexion (pas de boucle)', () => {
    expect(loginPathFor('/')).toBe('/login');
    expect(loginPathFor('/login')).toBe('/login');
    expect(loginPathFor('/login?returnTo=%2Fbons')).toBe('/login');
  });

  it('ignore une adresse de retour dangereuse', () => {
    expect(loginPathFor('//evil.com')).toBe('/login');
    expect(loginPathFor('/\\evil.com')).toBe('/login');
  });
});
