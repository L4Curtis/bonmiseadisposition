import { CSV_BOM, buildCsv, csvLine, escapeCsvCell } from '../csv';

describe('escapeCsvCell — anti-injection de formule (Excel/LibreOffice)', () => {
  it.each([
    ['=', '=SOMME(A1)'],
    ['+', '+1234567'],
    ['-', '-1234567'],
    ['@', '@cmd|/c calc'],
    ['tabulation', '\tcmd'],
    ['retour chariot', '\rcmd'],
  ])('préfixe d’une apostrophe une cellule commençant par « %s »', (_label, value) => {
    expect(escapeCsvCell(value)).toBe(`"'${value}"`);
  });

  it('n’altère pas une cellule sans caractère déclencheur de formule', () => {
    expect(escapeCsvCell('Dell')).toBe('"Dell"');
  });

  it('double les guillemets internes', () => {
    expect(escapeCsvCell('12" écran')).toBe('"12"" écran"');
  });

  it('garde le point-virgule et le saut de ligne à l’intérieur des guillemets', () => {
    expect(escapeCsvCell('a;b\nc')).toBe('"a;b\nc"');
  });

  it.each([
    [null, '""'],
    [undefined, '""'],
    [42, '"42"'],
    [0, '"0"'],
  ])('%s → %s', (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected);
  });

  it('un nombre négatif est traité comme du texte commençant par « - »', () => {
    expect(escapeCsvCell(-3)).toBe(`"'-3"`);
  });
});

describe('csvLine', () => {
  it('échappe chaque cellule et les sépare par un point-virgule', () => {
    expect(csvLine(['Réf', '=1+1', null])).toBe(`"Réf";"'=1+1";""`);
  });
});

describe('buildCsv', () => {
  it('BOM UTF-8, en-tête puis une ligne par enregistrement, séparées par \\n', () => {
    const csv = buildCsv({ header: ['nom', 'âge'], rows: [['Alice', 30], ['Bob', null]] });
    expect(CSV_BOM).toBe(String.fromCharCode(0xfeff));
    expect(csv).toBe(`${CSV_BOM}"nom";"âge"\n"Alice";"30"\n"Bob";""`);
  });

  it('sans ligne : BOM et en-tête seuls', () => {
    expect(buildCsv({ header: ['a'], rows: [] })).toBe(`${CSV_BOM}"a"`);
  });
});
