import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
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
  resetActiveFilialesForTests();
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

  it('masque par defaut les filiales desactivees et permet de les afficher via un controle explicite', async () => {
    const inactiveFiliale = {
      id: 'f2', name: 'Ancienne Filiale', displayName: 'Ancienne Filiale SAS', active: false, address: null, siret: null,
    };
    vi.mocked(api.get).mockResolvedValue([filiale, inactiveFiliale]);
    const { user } = renderWithProviders(<FilialesPage />);

    await screen.findByText('Fresse GDO SAS');
    expect(screen.queryByText('Ancienne Filiale SAS')).not.toBeInTheDocument();
    expect(screen.getByText('Afficher les filiales désactivées (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));

    expect(await screen.findByText('Ancienne Filiale SAS')).toBeInTheDocument();
    expect(screen.getByText('Désactivée')).toBeInTheDocument();
  });

  it('affiche — pour une adresse ou un siret absent', async () => {
    const bareFiliale = {
      id: 'f3', name: 'Filiale Nue', displayName: 'Filiale Nue SAS', active: true, address: null, siret: null,
    };
    vi.mocked(api.get).mockResolvedValue([bareFiliale]);
    renderWithProviders(<FilialesPage />);

    await screen.findByText('Filiale Nue SAS');
    // Logo absent, cachet absent, adresse absente : trois pastilles/valeurs à « — ».
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('SIRET: —')).toBeInTheDocument();
  });

  it('exporte le CSV des filiales sans puis avec les images', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['csv']));

    const { user } = renderWithProviders(<FilialesPage />);
    await screen.findByText('Fresse GDO SAS');

    await user.click(screen.getByRole('button', { name: /Autres actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Exporter CSV' }));
    await waitFor(() => expect(api.getBlob).toHaveBeenCalledWith('/filiales/export'));
    // Attend la fin de l'export (bouton réactivé) avant de rouvrir le menu.
    await waitFor(() => expect(screen.getByRole('button', { name: /Autres actions/ })).not.toBeDisabled());

    await user.click(screen.getByRole('button', { name: /Autres actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Exporter CSV avec images/ }));
    await waitFor(() => expect(api.getBlob).toHaveBeenCalledWith('/filiales/export?images=1'));

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });

  it('telecharge le modele CSV', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['csv']));

    const { user } = renderWithProviders(<FilialesPage />);
    await screen.findByText('Fresse GDO SAS');

    await user.click(screen.getByRole('button', { name: /Autres actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Télécharger un modèle' }));
    await waitFor(() => expect(api.getBlob).toHaveBeenCalledWith('/filiales/import/template'));

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });
});
