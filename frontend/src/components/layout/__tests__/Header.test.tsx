import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { Header } from '../Header';

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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: 'technician',
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

let mockView: 'direction' | 'technicien' | 'administrateur' | 'collaborateur' = 'technicien';

vi.mock('@/contexts/UiViewContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/UiViewContext')>();
  return {
    ...actual,
    useUiView: () => ({ activeView: mockView, setActiveView: vi.fn(), availableViews: ['technicien', 'administrateur'] }),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  mockView = 'technicien';
  vi.mocked(api.get).mockResolvedValue(null);
});

describe('Header', () => {
  it('affiche la recherche globale pour la vue technicien', () => {
    mockView = 'technicien';
    renderWithProviders(<Header />);

    expect(screen.getByLabelText('Recherche globale')).toBeInTheDocument();
  });

  it('affiche la recherche globale pour la vue administrateur', () => {
    mockView = 'administrateur';
    renderWithProviders(<Header />);

    expect(screen.getByLabelText('Recherche globale')).toBeInTheDocument();
  });

  it('masque la recherche globale pour la vue direction (lecture seule)', () => {
    mockView = 'direction';
    renderWithProviders(<Header />);

    expect(screen.queryByLabelText('Recherche globale')).not.toBeInTheDocument();
  });

  it('masque la recherche globale pour la vue collaborateur', () => {
    mockView = 'collaborateur';
    renderWithProviders(<Header />);

    expect(screen.queryByLabelText('Recherche globale')).not.toBeInTheDocument();
  });

  it('affiche le nom de l’utilisateur et le bouton de bascule de thème', () => {
    renderWithProviders(<Header />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activer le mode (clair|sombre)/i })).toBeInTheDocument();
  });
});
