import { sanitizeSmbName } from '../smb-filename';

describe('sanitizeSmbName', () => {
  it('strips accents and replaces spaces with dashes (cas nominal)', () => {
    expect(sanitizeSmbName('Éloïse Bénédicte')).toBe('Eloise-Benedicte');
  });

  it('trims stray spaces before collapsing them to dashes', () => {
    expect(sanitizeSmbName('  Jean  ')).toBe('Jean');
  });

  it('falls back to INCONNU when nothing latin remains (cas limite)', () => {
    expect(sanitizeSmbName('Иван Иванов')).toBe('INCONNU');
  });

  it('suffixes a reserved Windows device name', () => {
    expect(sanitizeSmbName('CON')).toBe('CON_');
    expect(sanitizeSmbName('con')).toBe('con_');
    expect(sanitizeSmbName('LPT1')).toBe('LPT1_');
  });

  it('leaves a name that merely starts like a reserved name untouched', () => {
    expect(sanitizeSmbName('CONSTANTIN')).toBe('CONSTANTIN');
  });
});
