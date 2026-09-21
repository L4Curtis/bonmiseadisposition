import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveSerialConflicts } from '../useLiveSerialConflicts';
import { newLine } from '../types';
import type { EquipmentLine } from '../types';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getBlob: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

const CONFLICT = { serialNumber: 'SN-1', bonId: 'b1', bonReference: 'BON-2026-0001', bonStatus: 'active', collaborateur: 'Marie Martin' };

beforeEach(() => {
  vi.resetAllMocks();
});

function setup(equipments: EquipmentLine[], excludeBonId?: string) {
  return renderHook(
    ({ equipments: eqs }: { equipments: EquipmentLine[] }) => useLiveSerialConflicts(eqs, excludeBonId),
    { initialProps: { equipments } },
  );
}

describe('useLiveSerialConflicts — C6, avertissement au fil de la saisie', () => {
  it('interroge /equipment/serial-conflicts et signale la ligne quand la valeur correspond toujours', async () => {
    const line = newLine({ serialNumber: 'SN-1' });
    vi.mocked(api.get).mockResolvedValue({ items: [CONFLICT], truncated: false });

    const { result, rerender } = setup([line]);
    act(() => result.current.checkSerial(line._id, 'SN-1'));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/equipment/serial-conflicts?serials=SN-1'));

    rerender({ equipments: [line] });
    await waitFor(() => expect(result.current.conflictsByLineId.get(line._id)).toEqual([CONFLICT]));
  });

  it("n'appelle pas l'API une seconde fois pour la même valeur (pas d'appel à chaque frappe)", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], truncated: false });
    const line = newLine({ serialNumber: 'SN-1' });
    const { result } = setup([line]);

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    act(() => result.current.checkSerial(line._id, 'sn-1')); // même valeur, casse différente
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("transmet excludeBonId à la requête (édition d'un bon existant)", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], truncated: false });
    const line = newLine({ serialNumber: 'SN-1' });
    const { result } = setup([line], 'bon-en-edition');

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('excludeBonId=bon-en-edition'));
  });

  it('ne signale plus le conflit si le champ a changé depuis la vérification', async () => {
    const line = newLine({ serialNumber: 'SN-1' });
    vi.mocked(api.get).mockResolvedValue({ items: [CONFLICT], truncated: false });
    const { result, rerender } = setup([line]);

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(result.current.conflictsByLineId.size).toBeGreaterThan(0));

    rerender({ equipments: [{ ...line, serialNumber: 'SN-AUTRE' }] });
    expect(result.current.conflictsByLineId.has(line._id)).toBe(false);
  });

  it('checkSerial avec une valeur vide efface un conflit déjà signalé pour la ligne', async () => {
    const line = newLine({ serialNumber: 'SN-1' });
    vi.mocked(api.get).mockResolvedValue({ items: [CONFLICT], truncated: false });
    const { result, rerender } = setup([line]);

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(result.current.conflictsByLineId.size).toBeGreaterThan(0));

    act(() => result.current.checkSerial(line._id, ''));
    rerender({ equipments: [{ ...line, serialNumber: '' }] });
    expect(result.current.conflictsByLineId.has(line._id)).toBe(false);
  });

  it('forgetLine oublie une ligne retirée du formulaire', async () => {
    const line = newLine({ serialNumber: 'SN-1' });
    vi.mocked(api.get).mockResolvedValue({ items: [CONFLICT], truncated: false });
    const { result, rerender } = setup([line]);

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(result.current.conflictsByLineId.size).toBeGreaterThan(0));

    act(() => result.current.forgetLine(line._id));
    rerender({ equipments: [] });
    expect(result.current.conflictsByLineId.has(line._id)).toBe(false);
  });

  it('une erreur réseau ne fait pas planter le hook — avertissement de confort, pas une garantie', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    const line = newLine({ serialNumber: 'SN-1' });
    const { result } = setup([line]);

    act(() => result.current.checkSerial(line._id, 'SN-1'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(result.current.conflictsByLineId.size).toBe(0);
  });
});
