import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BON_STATUS_LABELS } from '@/types';
import type { BonStatus } from '@/contracts/common';
import { STATUS_CHART_COLORS, statusChartColor } from '../status-chart-colors';

type Theme = 'light' | 'dark';

/** Valeurs des variables CSS du thème clair (`:root`) et sombre (`.dark`), lues dans index.css. */
function themeTokens(): Record<Theme, Map<string, string>> {
  const css = readFileSync(resolve(__dirname, '../../../../index.css'), 'utf8');
  const block = (selector: string): Map<string, string> => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  return { light: block(':root'), dark: block('.dark') };
}

/** « H S% L% » → [r, g, b] (0–255). */
function hslToRgb(value: string): [number, number, number] {
  const [h, s, l] = value.replace(/hsl\(|\)|%/g, '').trim().split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const distance = (a: string, b: string): number => {
  const [x, y] = [hslToRgb(a), hslToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const STATUSES = Object.keys(BON_STATUS_LABELS) as BonStatus[];
const tokens = themeTokens();

describe('Bons par statut : une couleur par statut', () => {
  it('chaque statut a sa couleur', () => {
    expect(Object.keys(STATUS_CHART_COLORS).sort()).toEqual([...STATUSES].sort());
  });

  it.each(['light', 'dark'] as const)('thème %s : huit couleurs résolues, toutes différentes et bien séparées', (theme) => {
    const colors = STATUSES.map((status) => statusChartColor(status, theme, (name) => tokens[theme].get(name) ?? ''));
    for (const color of colors) expect(color).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(new Set(colors).size).toBe(STATUSES.length);
    // Deux parts voisines du donut doivent se distinguer sans lire la légende.
    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        expect(distance(colors[i], colors[j]), `${STATUSES[i]} / ${STATUSES[j]}`).toBeGreaterThanOrEqual(70);
      }
    }
  });
});
