import { describe, it, expect } from 'vitest';
import { bitmapSizeFor, refitStrokes } from '../signature-geometry';

const REFERENCE = { width: 600, height: 300 };

describe('bitmapSizeFor', () => {
  it('cadre 2:1 (à la bordure près) : taille de référence, image exportée inchangée', () => {
    expect(bitmapSizeFor({ width: 326, height: 161 }, REFERENCE)).toBe(REFERENCE);
  });

  it('cadre debout : même largeur, hauteur dans les proportions du cadre', () => {
    expect(bitmapSizeFor({ width: 366, height: 610 }, REFERENCE)).toEqual({ width: 600, height: 1000 });
  });

  it('cadre masqué (taille nulle) : aucun changement', () => {
    expect(bitmapSizeFor({ width: 0, height: 0 }, REFERENCE)).toBeNull();
  });
});

describe('refitStrokes', () => {
  it('même taille : traits recopiés à l’identique, dans un nouveau tableau', () => {
    const strokes = [[{ x: 1, y: 2 }, { x: 3, y: 4 }]];
    const result = refitStrokes(strokes, REFERENCE, REFERENCE);
    expect(result).toEqual(strokes);
    expect(result[0]).not.toBe(strokes[0]);
  });

  it('traits qui tiennent : même échelle, même position relative', () => {
    const strokes = [[{ x: 250, y: 140 }, { x: 350, y: 160 }]];
    const [[a, b]] = refitStrokes(strokes, REFERENCE, { width: 600, height: 1200 });
    expect(b.x - a.x).toBeCloseTo(100);
    expect(b.y - a.y).toBeCloseTo(20);
    expect((a.y + b.y) / 2).toBeCloseTo(600);
  });

  it('traits trop grands : réduits sans déformation pour tenir, marge comprise', () => {
    const strokes = [[{ x: 100, y: 100 }, { x: 500, y: 900 }]];
    const [[a, b]] = refitStrokes(strokes, { width: 600, height: 1200 }, REFERENCE);
    // Rapport largeur / hauteur conservé (400 / 800).
    expect((b.x - a.x) / (b.y - a.y)).toBeCloseTo(0.5);
    expect(Math.min(a.y, b.y)).toBeGreaterThanOrEqual(4);
    expect(Math.max(a.y, b.y)).toBeLessThanOrEqual(296);
  });

  it('aucun trait : rien à reporter', () => {
    expect(refitStrokes([], REFERENCE, { width: 600, height: 1200 })).toEqual([]);
  });
});
