import { computeMissingPdfSnapshotTypes } from '../bons-missing-snapshots';

describe('computeMissingPdfSnapshotTypes', () => {
  it('signale un type attendu (signature signée) mais absent de PdfSnapshot (cas nominal)', () => {
    const missing = computeMissingPdfSnapshotTypes(
      [{ type: 'mise_disposition', pdfType: null }],
      new Set(),
      'active',
    );
    expect(missing).toEqual(['signature_collab_mise_disposition']);
  });

  it("ne signale rien quand le snapshot attendu existe déjà (cas limite : aucun manquant)", () => {
    const missing = computeMissingPdfSnapshotTypes(
      [{ type: 'mise_disposition', pdfType: null }],
      new Set(['signature_collab_mise_disposition']),
      'active',
    );
    expect(missing).toEqual([]);
  });

  it('déduit signature_it_restitution depuis le statut du bon quand pdfType est absent (it_cachet historique)', () => {
    const missing = computeMissingPdfSnapshotTypes(
      [{ type: 'it_cachet', pdfType: null }],
      new Set(),
      'partially_returned',
    );
    expect(missing).toEqual(['signature_it_restitution']);
  });

  it('priorise pdfType explicite sur la déduction par statut quand it_cachet le porte (flux récent)', () => {
    const missing = computeMissingPdfSnapshotTypes(
      [{ type: 'it_cachet', pdfType: 'restitution' }],
      new Set(),
      'active', // statut qui déduirait "mise_disposition" si pdfType était ignoré
    );
    expect(missing).toEqual(['signature_it_restitution']);
  });
});
