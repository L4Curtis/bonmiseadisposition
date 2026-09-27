import { describe, expect, it } from 'vitest';
import { filledSerial } from '../serial';

describe('filledSerial', () => {
  it('garde un numéro renseigné', () => {
    expect(filledSerial('SN-1')).toBe('SN-1');
  });

  it.each([[null], [''], ['   ']])('traite %j comme absent', (serial) => {
    expect(filledSerial(serial)).toBeNull();
  });
});
