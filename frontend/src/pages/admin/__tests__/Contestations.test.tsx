import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ContestationsPage } from '../Contestations';

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

const contestation = {
  id: 'c1',
  message: 'Écran cassé à réception',
  status: 'open' as const,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  bon: { id: 'b1', reference: 'BMD-2026-0001', status: 'active', filiale: { displayName: 'Paris' } },
  user: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com' },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ contestations: [contestation], total: 1, page: 1, limit: 20, openCount: 1 });
});

describe('ContestationsPage', () => {
  it('affiche la liste des contestations ouvertes et le badge de compteur', async () => {
    renderWithProviders(<ContestationsPage />);

    expect(await screen.findByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('BMD-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('1 ouvertes')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=open'));
  });
});
