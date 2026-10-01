import { describe, it, expect } from 'vitest';
import {
  confirmLabel, countLabel, exceedsLimit, filtersLabel, limitWarning, truncatedMessage,
} from '../export-summary';

const ITEMS = { singular: 'équipement', plural: 'équipements' };

describe('Annonce avant un export', () => {
  it('« N lignes » accordé et écrit à la française', () => {
    expect(countLabel(0, ITEMS)).toBe('0 équipement');
    expect(countLabel(1, ITEMS)).toBe('1 équipement');
    expect(countLabel(12345, ITEMS)).toBe(`${new Intl.NumberFormat('fr-FR').format(12345)} équipements`);
    expect(countLabel(3)).toBe('3 lignes');
  });

  it('filtres en mots d’écran, « aucun » sans filtre, valeurs vides ignorées', () => {
    expect(filtersLabel([])).toBe('aucun');
    expect(filtersLabel([
      { label: 'Filiale', value: 'Paris' },
      { label: 'Recherche', value: ' ' },
      { label: 'Situation', value: 'En cours' },
    ])).toBe('Filiale : Paris ; Situation : En cours');
  });

  it('prévient au-delà du plafond seulement quand le nombre et le plafond sont connus', () => {
    expect(exceedsLimit(10001, 10000)).toBe(true);
    expect(exceedsLimit(10000, 10000)).toBe(false);
    expect(exceedsLimit(null, 10000)).toBe(false);
    expect(exceedsLimit(5, undefined)).toBe(false);
    expect(limitWarning(12, 10, ITEMS)).toContain('ne contiendra que les 10 premières');
    expect(confirmLabel(12, 10)).toBe('Exporter les 10 premières lignes');
    expect(confirmLabel(5, 10)).toBe('Exporter');
  });
});

describe('Bandeau après un export coupé', () => {
  it('dit combien de lignes le fichier contient, et sur combien', () => {
    expect(truncatedMessage(12, 10)).toBe(
      'Le fichier ne contient que les 10 premières lignes sur 12. Affinez les filtres et exportez à nouveau pour obtenir le reste.',
    );
    expect(truncatedMessage(null, 10)).toContain('les 10 premières lignes.');
    expect(truncatedMessage(null, undefined)).toContain('a été coupé');
  });
});
