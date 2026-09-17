import { certificateLabel, ROLE_LABELS } from '../../render/certificate';

// ─── certificateLabel ──────────────────────────────────────────────────────────
// Comportement récemment corrigé (cachet IT annoté de la phase mise à
// disposition/restitution) : ce test le fige explicitement.

describe('certificateLabel', () => {
  it('returns the plain role label for a non-it_cachet signature', () => {
    expect(certificateLabel({ type: 'mise_disposition' })).toBe(ROLE_LABELS.mise_disposition);
    expect(certificateLabel({ type: 'restitution' })).toBe(ROLE_LABELS.restitution);
    expect(certificateLabel({ type: 'pv_cloture' })).toBe(ROLE_LABELS.pv_cloture);
  });

  it('falls back to the raw type when the role is unknown', () => {
    expect(certificateLabel({ type: 'unknown_type' })).toBe('unknown_type');
  });

  it('returns the plain it_cachet label when pdfType is absent', () => {
    expect(certificateLabel({ type: 'it_cachet' })).toBe('Service informatique — cachet');
    expect(certificateLabel({ type: 'it_cachet', pdfType: null })).toBe('Service informatique — cachet');
  });

  it('appends "mise à disposition" for an it_cachet signature typed mise_disposition', () => {
    expect(certificateLabel({ type: 'it_cachet', pdfType: 'mise_disposition' })).toBe(
      'Service informatique — cachet — mise à disposition',
    );
  });

  it('appends "restitution" for an it_cachet signature typed restitution', () => {
    expect(certificateLabel({ type: 'it_cachet', pdfType: 'restitution' })).toBe(
      'Service informatique — cachet — restitution',
    );
  });

  it('treats any pdfType other than restitution as mise à disposition (legacy default)', () => {
    expect(certificateLabel({ type: 'it_cachet', pdfType: 'something_else' })).toBe(
      'Service informatique — cachet — mise à disposition',
    );
  });
});
