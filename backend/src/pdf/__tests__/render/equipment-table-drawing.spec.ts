import PDFDocument = require('pdfkit');
import { DEFAULT_CONFIGS } from '../../pdf-template-defaults';
import type { BonForPdf } from '../../pdf-types';
import { drawAvenantNote, drawEquipmentTable, PdfEquipment } from '../../render/equipment-table';
import type { RenderFonts } from '../../render/layout';

/**
 * Tableau des équipements dessiné sur un vrai document PDFKit : on relit les
 * textes réellement écrits et les pages réellement ajoutées.
 */
const FONTS: RenderFonts = { regular: 'Helvetica', bold: 'Helvetica-Bold' };
const LEFT_X = 50;

function newDocument(): { doc: PDFKit.PDFDocument; texts: string[]; pageWidth: number } {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const texts: string[] = [];
  const originalText = doc.text.bind(doc);
  vi.spyOn(doc, 'text').mockImplementation(((value: unknown, ...rest: unknown[]) => {
    if (typeof value === 'string') texts.push(value);
    return (originalText as (...args: unknown[]) => PDFKit.PDFDocument)(value, ...rest);
  }) as typeof doc.text);
  return { doc, texts, pageWidth: doc.page.width - 100 };
}

function equipment(index: number, overrides: Partial<PdfEquipment> = {}): PdfEquipment {
  return {
    id: `eq-${index}`,
    catalogItem: null,
    customLabel: `Portable ${index}`,
    serialNumber: `SN-${index}`,
    inventoryNumber: null,
    notes: null,
    returnedAt: null,
    notReturned: false,
    notReturnedReason: null,
    ...overrides,
  };
}

function bonWith(equipments: PdfEquipment[], overrides: Partial<BonForPdf> = {}): BonForPdf {
  return { id: 'bon-1', reference: 'BON-2026-0042', equipments, ...overrides } as BonForPdf;
}

function draw(bon: BonForPdf, type: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant') {
  const page = newDocument();
  const config = structuredClone(DEFAULT_CONFIGS.mise_disposition);
  drawEquipmentTable(page.doc, bon, type, config, {}, FONTS, LEFT_X, page.pageWidth);
  return { ...page, config };
}

describe('tableau des équipements dans le PDF', () => {
  it('sans équipement : le message prévu par le modèle, sans ligne', () => {
    const { texts, config } = draw(bonWith([]), 'mise_disposition');
    expect(texts).toContain(config.table.emptyMessage);
    expect(texts).not.toContain('SN-1');
  });

  it('restitution : statut de chaque ligne et motif de non-restitution dans les remarques', () => {
    const { texts } = draw(
      bonWith([
        equipment(1, { returnedAt: new Date('2026-09-04T08:00:00Z') }),
        equipment(2, { notReturned: true, notReturnedReason: 'Perdu en déplacement', notes: 'Housse incluse' }),
        equipment(3),
      ]),
      'restitution',
    );
    expect(texts).toEqual(expect.arrayContaining(['Restitué', 'Non restitué', 'En attente']));
    expect(texts).toContain('Housse incluse — Perdu en déplacement');
  });

  it('beaucoup de lignes : nouvelle page, avec l’en-tête du tableau répété', () => {
    const { doc, texts } = draw(bonWith(Array.from({ length: 60 }, (_, i) => equipment(i + 1))), 'mise_disposition');
    const range = doc.bufferedPageRange();
    expect(range.count).toBeGreaterThan(1);
    expect(texts.filter((t) => t === 'N° SÉRIE')).toHaveLength(range.count);
    expect(texts).toContain('SN-60');
  });
});

describe('bandeau de l’avenant', () => {
  it('annonce les équipements retrouvés et rappelle que le PV initial reste valide', () => {
    const { doc, texts, pageWidth } = newDocument();
    const before = doc.y;
    drawAvenantNote(doc, DEFAULT_CONFIGS.mise_disposition.fonts, FONTS, LEFT_X, pageWidth);

    expect(texts.join(' ')).toContain('précédemment déclarés non restitués');
    expect(texts.join(' ')).toContain('Le PV de non-restitution initial reste valide.');
    expect(doc.y).toBe(before + 6 + 34);
  });
});
