import { revokeToken, isTokenRevoked, type RevokedTokenStore } from '../token-revocation';

/**
 * Spec ciblée sur `revokeToken` (fonction pure de token-revocation.ts) :
 * jamais testée directement (seulement à travers AuthService.revokeToken).
 * Le seuil de purge opportuniste (`onOverCapacity`) n'était couvert par
 * aucun test avant l'ajout de cette spec et de celle d'AuthService.
 */
describe('revokeToken (fonction pure, cf. AuthService.revokeToken)', () => {
  it("révoque le jeton et n'appelle pas onOverCapacity sous le seuil de 10000 entrées (cas nominal)", () => {
    const store: RevokedTokenStore = new Map();
    const onOverCapacity = jest.fn();

    revokeToken(store, 'un-jeton', 15 * 60 * 1000, onOverCapacity);

    expect(isTokenRevoked(store, 'un-jeton')).toBe(true);
    expect(onOverCapacity).not.toHaveBeenCalled();
  });

  it('déclenche onOverCapacity dès que le store atteint 10000 entrées (cas limite)', () => {
    const store: RevokedTokenStore = new Map();
    for (let i = 0; i < 10000; i++) {
      store.set(`hash-${i}`, Date.now() + 1000);
    }
    const onOverCapacity = jest.fn();

    revokeToken(store, 'jeton-10001', 15 * 60 * 1000, onOverCapacity);

    expect(onOverCapacity).toHaveBeenCalledTimes(1);
    expect(isTokenRevoked(store, 'jeton-10001')).toBe(true);
  });
});
