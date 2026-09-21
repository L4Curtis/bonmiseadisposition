import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TodayTab } from '../TodayTab';

const navigateMock = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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
  navigateMock.mockReset();
});

describe('TodayTab', () => {
  it('shows the overdue threshold from /bons/stats in the tile label, and navigates on click', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/bons/stats')) {
        return Promise.resolve({
          waitingSignature: 2, active: 5, overdue: 1, total: 8,
          archivedThisMonth: 3, partiallyReturned: 0, overdueThresholdDays: 10,
          byFiliale: [{ id: 'f1', name: 'Paris', count: 4 }],
        });
      }
      if (path.startsWith('/bons/recent')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    const { user } = renderWithProviders(<TodayTab />);

    const overdueCard = await screen.findByRole('button', { name: /En retard \(> 10 j\)/ });
    expect(overdueCard).toBeInTheDocument();

    await user.click(overdueCard);
    expect(navigateMock).toHaveBeenCalledWith('/bons?overdue=1');
  });

  it('falls back to a 7-day threshold when the backend does not send one', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/bons/stats')) {
        return Promise.resolve({
          waitingSignature: 0, active: 0, overdue: 0, total: 0,
          archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
        });
      }
      if (path.startsWith('/bons/recent')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithProviders(<TodayTab />);
    expect(await screen.findByText('En retard (> 7 j)')).toBeInTheDocument();
  });
});
