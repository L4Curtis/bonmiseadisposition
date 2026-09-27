import { certificateLabel, ROLE_LABELS } from '../../render/certificate';

// ─── certificateLabel ──────────────────────────────────────────────────────────
// Libellé d'une signature dans le certificat : rôle + document, avec le
// vocabulaire du lexique (« signature IT », « PV de non-restitution »).

describe('certificateLabel', () => {
  it('returns the plain role label for a collaborator signature', () => {
    expect(certificateLabel({ type: 'mise_disposition' })).toBe('Collaborateur — mise à disposition');
    expect(certificateLabel({ type: 'restitution' })).toBe('Collaborateur — restitution');
    expect(certificateLabel({ type: 'pv_cloture' })).toBe('Collaborateur — PV de non-restitution');
  });

  it('falls back to the raw type when the role is unknown', () => {
    expect(certificateLabel({ type: 'unknown_type' })).toBe('unknown_type');
  });

  it('names the IT signature « signature IT », never « cachet »', () => {
    expect(certificateLabel({ type: 'it_cachet' })).toBe(ROLE_LABELS.it_cachet);
    expect(ROLE_LABELS.it_cachet).toBe('Équipe informatique — signature IT');
    for (const label of Object.values(ROLE_LABELS)) expect(label).not.toMatch(/cachet/i);
  });

  it.each([
    ['mise_disposition', 'mise à disposition'],
    ['restitution', 'restitution'],
    ['pv_cloture', 'PV de non-restitution'],
    ['avenant', 'avenant'],
  ])('appends the document of an IT signature typed %s', (pdfType, label) => {
    expect(certificateLabel({ type: 'it_cachet', pdfType })).toBe(`Équipe informatique — signature IT — ${label}`);
  });

  it('keeps the plain IT label for an unknown document type', () => {
    expect(certificateLabel({ type: 'it_cachet', pdfType: 'something_else' })).toBe(ROLE_LABELS.it_cachet);
  });
});
