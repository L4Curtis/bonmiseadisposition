import { computeTableColumns, filterEquipmentsForDocumentType, PdfEquipment } from '../../render/equipment-table';

// ─── filterEquipmentsForDocumentType ──────────────────────────────────────────

describe('filterEquipmentsForDocumentType', () => {
  const eq = (overrides: Partial<PdfEquipment>): PdfEquipment => ({
    id: 'eq-default',
    catalogItem: null,
    customLabel: null,
    serialNumber: null,
    inventoryNumber: null,
    notes: null,
    returnedAt: null,
    notReturned: false,
    notReturnedReason: null,
    ...overrides,
  });

  it('returns every equipment unchanged for mise_disposition and restitution', () => {
    const equipments = [eq({ id: 'a' }), eq({ id: 'b', notReturned: true })];

    expect(filterEquipmentsForDocumentType(equipments, 'mise_disposition')).toEqual(equipments);
    expect(filterEquipmentsForDocumentType(equipments, 'restitution')).toEqual(equipments);
  });

  it('keeps only equipment marked notReturned for cloture', () => {
    const equipments = [
      eq({ id: 'returned', notReturned: false }),
      eq({ id: 'missing-1', notReturned: true }),
      eq({ id: 'missing-2', notReturned: true }),
    ];

    const result = filterEquipmentsForDocumentType(equipments, 'cloture');

    expect(result.map((e) => e.id)).toEqual(['missing-1', 'missing-2']);
  });

  it('for avenant, keeps only the explicitly listed _avenantEquipmentIds when provided', () => {
    const equipments = [
      eq({ id: 'a', returnedAt: new Date(), notReturned: false }),
      eq({ id: 'b', returnedAt: null, notReturned: true }),
      eq({ id: 'c', returnedAt: new Date(), notReturned: false }),
    ];

    const result = filterEquipmentsForDocumentType(equipments, 'avenant', ['b']);

    expect(result.map((e) => e.id)).toEqual(['b']);
  });

  it('for avenant without _avenantEquipmentIds, falls back to returned-and-not-notReturned equipment', () => {
    const equipments = [
      eq({ id: 'returned-ok', returnedAt: new Date(), notReturned: false }),
      eq({ id: 'not-returned', returnedAt: null, notReturned: true }),
      eq({ id: 'returned-but-flagged', returnedAt: new Date(), notReturned: true }),
    ];

    const result = filterEquipmentsForDocumentType(equipments, 'avenant');

    expect(result.map((e) => e.id)).toEqual(['returned-ok']);
  });

  it('for avenant with an empty _avenantEquipmentIds array, uses the fallback too', () => {
    const equipments = [eq({ id: 'returned-ok', returnedAt: new Date(), notReturned: false })];

    const result = filterEquipmentsForDocumentType(equipments, 'avenant', []);

    expect(result.map((e) => e.id)).toEqual(['returned-ok']);
  });
});

// ─── computeTableColumns ───────────────────────────────────────────────────────

describe('computeTableColumns', () => {
  it('uses the 4-column layout (no Statut) for mise_disposition, with the # column', () => {
    const layout = computeTableColumns('mise_disposition', 400, true);

    expect(layout.hasStatutCol).toBe(false);
    expect(layout.headers).toEqual(['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Remarques']);
    expect(layout.colWidths).toHaveLength(5);
    expect(layout.numIdx).toBe(0);
    expect(layout.designationIdx).toBe(1);
    expect(layout.statutIdx).toBe(-1);
    expect(layout.lastIdx).toBe(4);
    // Column widths must sum exactly to pageWidth (no drift from rounding)
    expect(layout.colWidths.reduce((s, w) => s + w, 0)).toBeCloseTo(400, 9);
  });

  it('uses the 5-column layout (with Statut) for restitution and cloture', () => {
    for (const documentType of ['restitution', 'cloture'] as const) {
      const layout = computeTableColumns(documentType, 400, true);

      expect(layout.hasStatutCol).toBe(true);
      expect(layout.headers).toEqual(['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Statut', 'Remarques']);
      expect(layout.statutIdx).toBe(4);
      expect(layout.lastIdx).toBe(5);
      expect(layout.colWidths.reduce((s, w) => s + w, 0)).toBeCloseTo(400, 9);
    }
  });

  it('drops the # column and index when showRowNum is false', () => {
    const layout = computeTableColumns('mise_disposition', 400, false);

    expect(layout.headers[0]).not.toBe('#');
    expect(layout.numIdx).toBe(-1);
    expect(layout.designationIdx).toBe(0);
    expect(layout.colWidths.reduce((s, w) => s + w, 0)).toBeCloseTo(400, 9);
  });

  it('avenant uses the same 4-column layout as mise_disposition', () => {
    const layout = computeTableColumns('avenant', 400, true);

    expect(layout.hasStatutCol).toBe(false);
    expect(layout.headers).toEqual(['#', 'Désignation', 'N° Série', 'N° Inventaire', 'Remarques']);
  });
});
