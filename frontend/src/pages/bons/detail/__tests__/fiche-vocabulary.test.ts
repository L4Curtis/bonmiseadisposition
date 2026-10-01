import { describe, expect, it } from 'vitest';
import { STAGE_LABELS } from '../BonAttachments';
import { TYPE_LABELS } from '../BonIntegrity';

/** Vocabulaire de la fiche IT (§1 du plan) : « signature IT », « remise »,
 *  « PV de non-restitution » ; plus de « cachet IT » ni de « PV de clôture ». */
describe('vocabulaire de la fiche IT', () => {
  it('intégrité des signatures : « Signature IT », « Remise », « PV de non-restitution »', () => {
    expect(TYPE_LABELS).toEqual({
      it_cachet: 'Signature IT',
      mise_disposition: 'Remise',
      restitution: 'Restitution',
      pv_cloture: 'PV de non-restitution',
    });
  });

  it('étapes des pièces jointes : jamais « PV de clôture » ni « mise à disposition »', () => {
    const labels = Object.values(STAGE_LABELS).join(' ');
    expect(labels).not.toMatch(/clôture|mise à disposition|cachet/i);
    expect(STAGE_LABELS.pv_cloture).toBe('PV de non-restitution');
  });
});
