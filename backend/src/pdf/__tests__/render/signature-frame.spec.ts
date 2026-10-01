import { describe, expect, it, vi } from 'vitest';
import { SIGNATURE_IMAGE_MARGIN, renderSignatureBox, signatureImageFrame, signatureZone } from '../../render/signatures';

/** Géométrie de la case signature : le tracé reste dans son cadre, à distance
 *  de la mention « Lu et approuvé… », même quand il monte tout en haut. */
describe('cadre de la signature dans le PDF', () => {
  const x = 300;
  const y = 400;
  const width = 240;

  it('la zone commence sous la mention (deux lignes à 6,5 pt comprises)', () => {
    const zone = signatureZone(x, y, width);
    // Mention à y + 33, deux lignes d'environ 8 pt : fin vers y + 49.
    expect(zone.y).toBeGreaterThanOrEqual(y + 50);
    expect(zone.y + zone.height).toBeLessThanOrEqual(y + 122);
  });

  it('l’image tient dans la zone avec une marge de chaque côté', () => {
    const zone = signatureZone(x, y, width);
    const frame = signatureImageFrame(x, y, width);
    expect(frame.x - zone.x).toBeGreaterThanOrEqual(SIGNATURE_IMAGE_MARGIN);
    expect(frame.y - zone.y).toBeGreaterThanOrEqual(SIGNATURE_IMAGE_MARGIN);
    expect(zone.x + zone.width - (frame.x + frame.width)).toBeGreaterThanOrEqual(SIGNATURE_IMAGE_MARGIN);
    expect(zone.y + zone.height - (frame.y + frame.height)).toBeGreaterThanOrEqual(SIGNATURE_IMAGE_MARGIN);
    expect(SIGNATURE_IMAGE_MARGIN).toBeGreaterThanOrEqual(5);
  });

  it('l’image est posée dans ce cadre (fit), et découpée à la zone : rien ne déborde', () => {
    const calls: string[] = [];
    const chain = new Proxy({}, {
      get: (_t, prop: string) => (...args: unknown[]) => {
        calls.push(prop);
        if (prop === 'image') imageArgs.push(args);
        return chain;
      },
    }) as unknown as PDFKit.PDFDocument;
    const imageArgs: unknown[][] = [];
    const png = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;
    renderSignatureBox(chain, x, y, width, {
      title: 'Collaborateur', name: 'M. Hugo Petit', mention: 'Lu et approuvé', date: '28/09/2026', signatureImage: png,
    } as never, { border: '#ccc', primary: '#f00', dark: '#000', gray: '#666', lightGray: '#999' } as never, { regular: 'R', bold: 'B' });
    const frame = signatureImageFrame(x, y, width);
    expect(imageArgs).toHaveLength(1);
    const [, ix, iy, options] = imageArgs[0] as [unknown, number, number, { fit: [number, number] }];
    expect([ix, iy]).toEqual([frame.x, frame.y]);
    expect(options.fit).toEqual([frame.width, frame.height]);
    // Découpe : save → clip → image → restore.
    const clip = calls.indexOf('clip');
    expect(clip).toBeGreaterThan(-1);
    expect(calls.indexOf('save')).toBeLessThan(clip);
    expect(calls.indexOf('image')).toBeGreaterThan(clip);
    expect(calls.lastIndexOf('restore')).toBeGreaterThan(calls.indexOf('image'));
  });
});
