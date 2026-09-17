import { isDeliverableEmail, undeliverableEmailMessage } from '../email';

describe('isDeliverableEmail', () => {
  it.each([
    ['jean.dupont@groupe-livio.com', true],
    ['  Jean@Exemple.fr ', true],
    ['admin@local', false],
    ['sans-arobase', false],
    ['@exemple.fr', false],
    ['jean@exemple', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (email, expected) => {
    expect(isDeliverableEmail(email as string | null | undefined)).toBe(expected);
  });

  it('formule un message en français citant l’adresse', () => {
    expect(undeliverableEmailMessage('admin@local')).toContain('admin@local');
    expect(undeliverableEmailMessage(null)).toContain('vide');
  });
});
