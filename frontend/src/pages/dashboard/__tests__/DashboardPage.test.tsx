import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { DashboardPage } from '../DashboardPage';

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

let mockRole = 'admin';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: mockRole,
      displayName: 'Test User',
      email: 't@example.com',
      isItStaff: true,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'test',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  mockRole = 'admin';
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/bons/stats')) {
      return Promise.resolve({
        waitingSignature: 0, active: 0, overdue: 0, total: 0,
        archivedThisMonth: 0, partiallyReturned: 0, byFiliale: [],
      });
    }
    if (path.startsWith('/bons/recent')) return Promise.resolve([]);
    if (path.startsWith('/filiales/active')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

describe('DashboardPage', () => {
  it('shows all 4 tabs for an admin, with "Aujourd\'hui" active by default', async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByRole('tab', { name: "Aujourd'hui" })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Parc' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Délais' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Incidents' })).toBeInTheDocument();

    // Laisse les appels de TodayTab se résoudre pour ne pas terminer le test
    // avec une mise à jour d'état en attente.
    await screen.findByText('Bons ouverts');
  });

  it('selects "Délais" when ?tab=delais is present in the URL', async () => {
    renderWithProviders(<DashboardPage />, { route: '/dashboard?tab=delais' });
    expect(await screen.findByRole('tab', { name: 'Délais' })).toHaveAttribute('data-state', 'active');
  });

  it('hides "Aujourd\'hui" and defaults to "Parc" for a non-IT / unknown role', async () => {
    mockRole = 'collaborator';
    renderWithProviders(<DashboardPage />);

    expect(screen.queryByRole('tab', { name: "Aujourd'hui" })).not.toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: 'Parc' })).toHaveAttribute('data-state', 'active');
  });
});
