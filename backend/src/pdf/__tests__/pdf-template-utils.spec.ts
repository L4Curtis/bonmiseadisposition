import { deepMergeConfig, substituteVars } from '../pdf-template-utils';
import { DEFAULT_CONFIGS } from '../pdf-template-defaults';

/** Spec ciblée sur les deux fonctions pures extraites de pdf-template-config.ts. */
describe('pdf-template-utils', () => {
  describe('deepMergeConfig', () => {
    it('fusionne uniquement les clés connues de chaque section fournie (cas nominal)', () => {
      const base = DEFAULT_CONFIGS['mise_disposition'];

      const merged = deepMergeConfig(base, {
        header: { titleText: 'TITRE PERSONNALISÉ' },
        colors: { primary: '#000000' },
      });

      expect(merged.header.titleText).toBe('TITRE PERSONNALISÉ');
      // Les autres champs de la section restent ceux de base (pas de remplacement total).
      expect(merged.header.showLogo).toBe(base.header.showLogo);
      expect(merged.colors.primary).toBe('#000000');
      expect(merged.colors.dark).toBe(base.colors.dark);
      // base n'est jamais mutée (structuredClone).
      expect(base.header.titleText).not.toBe('TITRE PERSONNALISÉ');
    });

    it('ignore une clé inconnue, une section absente, ou une valeur undefined (cas limite)', () => {
      const base = DEFAULT_CONFIGS['mise_disposition'];

      const merged = deepMergeConfig(base, {
        header: { titleText: undefined, champInconnu: 'ignoré' },
        sectionInconnue: { x: 1 },
      });

      expect(merged.header.titleText).toBe(base.header.titleText);
      expect(merged).not.toHaveProperty('sectionInconnue');
      expect((merged.header as unknown as Record<string, unknown>).champInconnu).toBeUndefined();
    });
  });

  describe('substituteVars', () => {
    it('remplace chaque placeholder {{VAR}} par sa valeur (cas nominal)', () => {
      const result = substituteVars('Bon {{REFERENCE}} — {{FILIALE}}', {
        REFERENCE: 'BMD-2026-0042',
        FILIALE: 'Paris',
      });
      expect(result).toBe('Bon BMD-2026-0042 — Paris');
    });

    it('remplace un placeholder sans valeur fournie par une chaîne vide (cas limite)', () => {
      const result = substituteVars('{{FILIALE}} — {{INCONNU}}', { FILIALE: 'Paris' });
      expect(result).toBe('Paris — ');
    });
  });
});
