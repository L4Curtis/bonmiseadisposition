import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { UtilisateursPage } from '../Utilisateurs';

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

const CURRENT_USER_ID = 'admin-1';
let mockRole = 'admin';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: CURRENT_USER_ID,
      role: mockRole,
      displayName: 'Current User',
      email: 'current@example.com',
      isItStaff: true,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'current',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

const users = [
  {
    id: CURRENT_USER_ID,
    samAccountName: 'current',
    displayName: 'Current User',
    email: 'current@example.com',
    isItStaff: true,
    isLocalAccount: true,
    mustChangePassword: false,
    role: 'admin',
    active: true,
  },
  {
    id: 'user-2',
    samAccountName: 'jdupont',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@example.com',
    isItStaff: false,
    isLocalAccount: false,
    mustChangePassword: false,
    role: 'collaborator',
    active: true,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'admin';
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/users?')) return Promise.resolve({ users, total: users.length, page: 1, limit: 25 });
    return Promise.resolve(null);
  });
});

describe('UtilisateursPage — rôle direction (lot 3b)', () => {
  it('affiche un sélecteur de rôle pour un admin, désactivé sur sa propre ligne', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(users.length);

    expect(screen.getByRole('combobox', { name: /Rôle de Current User/i })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Rôle de Jean Dupont/i })).not.toBeDisabled();
  });

  it("n'affiche pas de sélecteur pour un technicien (libellé seul)", async () => {
    mockRole = 'technician';
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText('Collaborateur')).toBeInTheDocument();
  });

  it('affiche la note SSO uniquement pour le compte non local', async () => {
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    expect(screen.getByText(/Compte SSO : rôle recalculé depuis les groupes Entra/i)).toBeInTheDocument();
  });

  it('change le rôle via PATCH /admin/users/:id/role et met à jour la ligne', async () => {
    vi.mocked(api.patch).mockResolvedValue({ id: 'user-2', role: 'direction', isItStaff: false });
    // pointerEventsCheck: 0 — cf. BonCreate.test.tsx : Radix <Select> bascule
    // pointer-events sur <body> pendant l'animation, non garantie terminée en jsdom.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(<UtilisateursPage />);

    await screen.findByText('Jean Dupont');
    const otherRowSelect = screen.getByRole('combobox', { name: /Rôle de Jean Dupont/i });
    await user.click(otherRowSelect);
    await user.click(await screen.findByRole('option', { name: 'Direction' }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/users/user-2/role', { role: 'direction' });
    });
  });
});
