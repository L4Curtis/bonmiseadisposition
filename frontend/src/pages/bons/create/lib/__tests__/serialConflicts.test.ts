import { describe, it, expect } from 'vitest';
import { withoutReplacedBon } from '../serialConflicts';
import type { SerialConflict } from '../../types';

const conflict = (bonId: string, serialNumber = 'SN-1'): SerialConflict => ({
  serialNumber, bonId, bonReference: `REF-${bonId}`, bonStatus: 'active', collaborateur: 'Léa Martin',
});

describe('withoutReplacedBon', () => {
  it('ignore les numéros du bon remplacé, garde les vrais conflits', () => {
    expect(withoutReplacedBon([conflict('original'), conflict('autre', 'SN-2')], 'original')).toEqual([conflict('autre', 'SN-2')]);
  });

  it('bon ordinaire (ne remplace rien) : tous les conflits restent', () => {
    expect(withoutReplacedBon([conflict('original')], null)).toEqual([conflict('original')]);
  });
});
