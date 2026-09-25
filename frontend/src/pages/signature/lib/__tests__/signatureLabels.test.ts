import { describe, it, expect } from 'vitest';
import { signatureDocLabel, signatureStageForType, signatureTypeLabel } from '../signatureLabels';

describe('signatureTypeLabel', () => {
  it('labels a pv_cloture signature', () => {
    expect(signatureTypeLabel('pv_cloture')).toBe('PV de non-restitution');
  });

  it('labels a restitution signature', () => {
    expect(signatureTypeLabel('restitution')).toBe('restitution');
  });

  it('falls back to mise à disposition for any other type (including undefined)', () => {
    expect(signatureTypeLabel('mise_disposition')).toBe('mise à disposition');
    expect(signatureTypeLabel(undefined)).toBe('mise à disposition');
  });
});

describe('signatureDocLabel', () => {
  it('uses "Le PV de non-restitution" for pv_cloture', () => {
    expect(signatureDocLabel('pv_cloture')).toBe('Le PV de non-restitution');
  });

  it('uses "Le bon de <type>" for other types', () => {
    expect(signatureDocLabel('restitution')).toBe('Le bon de restitution');
    expect(signatureDocLabel('mise_disposition')).toBe('Le bon de mise à disposition');
  });
});

describe('signatureStageForType', () => {
  it('maps each signature type to its PDF snapshot stage', () => {
    expect(signatureStageForType('restitution')).toBe('signature_collab_restitution');
    expect(signatureStageForType('pv_cloture')).toBe('cloture_equipements_manquants');
    expect(signatureStageForType('mise_disposition')).toBe('signature_collab_mise_disposition');
    expect(signatureStageForType(undefined)).toBe('signature_collab_mise_disposition');
  });
});
