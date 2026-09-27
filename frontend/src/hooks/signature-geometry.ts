/** Géométrie du tracé de signature : taille du canevas qui suit son cadre à
 *  l'écran, et report des traits quand cette taille change.
 *
 *  Le cadre plein écran d'un téléphone n'a pas les proportions de l'image
 *  envoyée au PDF (2:1) : en portrait, il est bien plus haut que large. Le
 *  canevas prend alors les proportions du cadre (le tracé n'est jamais étiré),
 *  et les traits sont reportés, sans déformation ni rotation, dans le nouveau
 *  canevas puis dans l'image exportée. */

export interface Point {
  x: number;
  y: number;
}
export type Stroke = ReadonlyArray<Point>;

export interface Size {
  width: number;
  height: number;
}

/** Marge gardée autour des traits quand il faut les réduire pour qu'ils
 *  tiennent : la moitié du trait épais de l'export n'est pas rognée. */
const FIT_PADDING = 4;

/** En deçà de cet écart aux proportions de référence, le canevas garde sa
 *  taille de référence : la bordure du cadre (quelques pixels) ne doit pas
 *  changer la résolution, ni l'image exportée depuis la page. */
const ASPECT_TOLERANCE = 0.025;

/** Taille du canevas pour un cadre affiché en `frame` (pixels CSS) : même
 *  largeur que la référence, hauteur dans les proportions du cadre. `null` si
 *  le cadre n'a pas de taille (masqué). */
export function bitmapSizeFor(frame: Size, reference: Size): Size | null {
  if (frame.width <= 0 || frame.height <= 0) return null;
  const frameAspect = frame.width / frame.height;
  const referenceAspect = reference.width / reference.height;
  if (Math.abs(frameAspect / referenceAspect - 1) <= ASPECT_TOLERANCE) return reference;
  return { width: reference.width, height: Math.max(1, Math.round(reference.width / frameAspect)) };
}

function boundsOf(strokes: ReadonlyArray<Stroke>) {
  const points = strokes.flat();
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Centre recherché sur un axe : même position relative que dans l'ancien
 *  canevas, ramenée pour que les traits (de demi-étendue `half`) y tiennent. */
function placeCenter(center: number, from: number, to: number, half: number): number {
  const wanted = (center * to) / from;
  const low = half + FIT_PADDING;
  const high = to - half - FIT_PADDING;
  if (low > high) return to / 2;
  return Math.min(Math.max(wanted, low), high);
}

/** Reporte les traits d'un canevas `from` dans un canevas `to` : même échelle
 *  s'ils y tiennent, sinon réduits juste assez, toujours sans déformation ni
 *  rotation ; leur position relative est gardée. Renvoie de nouveaux traits. */
export function refitStrokes(strokes: ReadonlyArray<Stroke>, from: Size, to: Size): Stroke[] {
  const bounds = boundsOf(strokes);
  if (!bounds || (from.width === to.width && from.height === to.height)) return strokes.map((s) => [...s]);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = Math.min(
    1,
    (to.width - 2 * FIT_PADDING) / Math.max(spanX, 1),
    (to.height - 2 * FIT_PADDING) / Math.max(spanY, 1),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const newCenterX = placeCenter(centerX, from.width, to.width, (spanX * scale) / 2);
  const newCenterY = placeCenter(centerY, from.height, to.height, (spanY * scale) / 2);
  return strokes.map((stroke) =>
    stroke.map((p) => ({ x: (p.x - centerX) * scale + newCenterX, y: (p.y - centerY) * scale + newCenterY })),
  );
}
