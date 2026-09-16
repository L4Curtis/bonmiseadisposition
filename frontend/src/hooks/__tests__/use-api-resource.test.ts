import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiResource } from '../use-api-resource';

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

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useApiResource', () => {
  it('starts loading then resolves with data', async () => {
    vi.mocked(api.get).mockResolvedValue({ value: 42 });

    const { result } = renderHook(() => useApiResource<{ value: number }>('/foo', 'Erreur'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 42 });
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message and reload() re-fetches', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useApiResource<{ value: number }>('/foo', 'Erreur de secours'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('boom');

    vi.mocked(api.get).mockResolvedValueOnce({ value: 1 });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 1 });
    expect(result.current.error).toBeNull();
  });

  it('applies only the last of two out-of-order responses', async () => {
    let resolveFirst!: (value: { id: string }) => void;
    let resolveSecond!: (value: { id: string }) => void;
    const first = new Promise<{ id: string }>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<{ id: string }>((resolve) => { resolveSecond = resolve; });

    vi.mocked(api.get)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useApiResource<{ id: string }>(path, 'Erreur'),
      { initialProps: { path: '/a' } },
    );

    rerender({ path: '/b' });

    // La réponse la plus récente (seconde requête) arrive en premier ; l'ancienne
    // (première requête) arrive ensuite : seule la plus récente doit être appliquée.
    resolveSecond({ id: 'second' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'second' }));

    resolveFirst({ id: 'first' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.data).toEqual({ id: 'second' });
  });

  it('does not call the API when path is null', () => {
    const { result } = renderHook(() => useApiResource(null, 'Erreur'));
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});
