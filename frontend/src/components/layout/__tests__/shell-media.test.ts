import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_SHELL_QUERY, PHONE_SHELL_QUERY } from '../shell-media';

interface Screen {
  width: number;
  height: number;
  pointer: 'fine' | 'coarse' | 'none';
}

/** Évalue le sous-ensemble de requêtes média employé par shell-media.ts :
 *  une liste « , » de conjonctions « and » de conditions simples. */
function matches(query: string, screen: Screen): boolean {
  return query.split(',').some((alternative) =>
    alternative.split(' and ').every((condition) => {
      const match = /\(\s*([a-z-]+)\s*:\s*([a-z0-9]+?)(px)?\s*\)/.exec(condition.trim());
      if (!match) throw new Error(`Condition non reconnue : ${condition}`);
      const [, feature, value] = match;
      switch (feature) {
        case 'min-width': return screen.width >= Number(value);
        case 'max-width': return screen.width <= Number(value);
        case 'min-height': return screen.height >= Number(value);
        case 'max-height': return screen.height <= Number(value);
        case 'pointer': return screen.pointer === value;
        default: throw new Error(`Caractéristique non gérée : ${feature}`);
      }
    }),
  );
}

const isPhoneShell = (screen: Screen) => matches(PHONE_SHELL_QUERY, screen);
const isDesktopShell = (screen: Screen) => matches(DESKTOP_SHELL_QUERY, screen);

describe('shell-media', () => {
  it.each([
    ['iPhone 13 portrait', { width: 390, height: 664, pointer: 'coarse' }],
    ['iPhone 13 paysage', { width: 750, height: 342, pointer: 'coarse' }],
    ['Pixel 7 paysage (défaut signalé)', { width: 863, height: 360, pointer: 'coarse' }],
    ['Galaxy S9+ portrait', { width: 320, height: 658, pointer: 'coarse' }],
    ['Galaxy S9+ paysage', { width: 658, height: 320, pointer: 'coarse' }],
  ] as const)('%s : coque téléphone (tiroir)', (_name, screen) => {
    expect(isPhoneShell(screen)).toBe(true);
    expect(isDesktopShell(screen)).toBe(false);
  });

  it.each([
    ['iPad portrait', { width: 768, height: 1024, pointer: 'coarse' }],
    ['iPad paysage', { width: 1024, height: 768, pointer: 'coarse' }],
    ['ordinateur 1280', { width: 1280, height: 720, pointer: 'fine' }],
    ['fenêtre de bureau basse', { width: 1280, height: 420, pointer: 'fine' }],
    ['écran sans pointeur', { width: 1024, height: 400, pointer: 'none' }],
  ] as const)('%s : coque tablette et ordinateur (menu latéral)', (_name, screen) => {
    expect(isDesktopShell(screen)).toBe(true);
    expect(isPhoneShell(screen)).toBe(false);
  });

  it('les deux requêtes sont complémentaires : jamais les deux, jamais aucune', () => {
    for (const pointer of ['fine', 'coarse', 'none'] as const) {
      for (let width = 300; width <= 1400; width += 17) {
        for (let height = 250; height <= 1100; height += 13) {
          const screen = { width, height, pointer };
          expect(isPhoneShell(screen)).not.toBe(isDesktopShell(screen));
        }
      }
    }
  });

  it('index.css emploie la même requête pour son bloc « téléphone »', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(css).toContain(`@media ${PHONE_SHELL_QUERY} {`);
  });
});
