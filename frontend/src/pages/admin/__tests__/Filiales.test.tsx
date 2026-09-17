import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { FilialesPage } from '../Filiales';

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

const filiale = {
  id: 'f1',
  name: 'Fresse GDO',
  displayName: 'Fresse GDO SAS',
  active: true,
  address: null,
  siret: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'admin';
  vi.mocked(api.get).mockResolvedValue([filiale]);
});

describe('FilialesPage', () => {
  it('affiche la liste des filiales avec le bouton de suppression pour un admin', async () => {
    renderWithProviders(<FilialesPage />);

    expect(await screen.findByText('Fresse GDO SAS')).toBeInTheDocument();
    expect(screen.getByText('AD: Fresse GDO')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Admin : bouton éditer (crayon) + bouton supprimer (poubelle), tous deux sans libellé texte.
    expect(screen.getAllByRole('button', { name: '' })).toHaveLength(2);
  });

  it("masque la suppression pour un rôle non-admin (technicien)", async () => {
    mockRole = 'technician';
    renderWithProviders(<FilialesPage />);

    await screen.findByText('Fresse GDO SAS');
    // Seul le bouton d'édition (crayon) doit rester, pas de bouton suppression.
    expect(screen.getAllByRole('button', { name: '' })).toHaveLength(1);
  });
});
