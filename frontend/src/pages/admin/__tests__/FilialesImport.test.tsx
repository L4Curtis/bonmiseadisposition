import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1', role: 'admin', displayName: 'Test User', email: 't@example.com',
      isItStaff: true, isLocalAccount: true, mustChangePassword: false, active: true, samAccountName: 'test',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

const filiale = {
  id: 'f1', name: 'Fresse GDO', displayName: 'Fresse GDO SAS', active: true, address: null, siret: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  vi.mocked(api.get).mockResolvedValue([filiale]);
});

async function openImportDialog(): Promise<{ user: ReturnType<typeof renderWithProviders>['user'] }> {
  const { user } = renderWithProviders(<FilialesPage />);
  await screen.findByText('Fresse GDO SAS');
  await user.click(screen.getByRole('button', { name: /Autres actions/ }));
  await user.click(await screen.findByRole('menuitem', { name: /Importer un CSV/ }));
  await screen.findByRole('dialog');
  return { user };
}

describe('Import CSV des filiales', () => {
  it('affiche un aperçu et importe un fichier CSV valide', async () => {
    vi.mocked(api.post).mockResolvedValue({
      created: 1, updated: 1, skipped: 0, errors: [],
    });
    const { user } = await openImportDialog();

    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\n'
      + 'Nouvelle Filiale;Nouvelle Filiale SAS;1 rue Neuve;123456789;oui;;\n'
      + 'Autre Filiale;;;;non;;\n';
    const file = new File([csv], 'filiales.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);

    expect(await screen.findByText('2 ligne(s) valide(s) prête(s) à importer.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importer (2)' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/filiales/import', {
      items: [
        {
          name: 'Nouvelle Filiale',
          displayName: 'Nouvelle Filiale SAS',
          address: '1 rue Neuve',
          siret: '123456789',
          active: true,
          logoBase64: undefined,
          stampBase64: undefined,
        },
        {
          name: 'Autre Filiale',
          displayName: undefined,
          address: undefined,
          siret: undefined,
          active: false,
          logoBase64: undefined,
          stampBase64: undefined,
        },
      ],
    }));

    expect(await screen.findByText('Créées : 1 · Mises à jour : 1 · Ignorées : 0')).toBeInTheDocument();
    // 1) chargement initial de /filiales, 2) rechargement après import
    // (onImported), 3) invalidateActiveFiliales (/filiales/active) déclenché
    // par l'import — la nouvelle filiale doit apparaître sans délai dans les
    // formulaires qui affichent la liste active.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  });

  it('rejette les lignes invalides (nom manquant, valeur active invalide) avant tout appel API', async () => {
    const { user } = await openImportDialog();

    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\n'
      + ';Sans Nom;;;;;\n'
      + 'Filiale;;;;peut-etre;;\n';
    const file = new File([csv], 'invalide.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);

    expect(await screen.findByText('2 ligne(s) ignorée(s)')).toBeInTheDocument();
    expect(screen.getByText('Ligne 2 : Nom obligatoire')).toBeInTheDocument();
    expect(screen.getByText('Ligne 3 : Valeur « active » invalide (oui/non attendu)')).toBeInTheDocument();

    const importButton = screen.getByRole('button', { name: 'Importer (0)' });
    expect(importButton).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("affiche les erreurs ligne par ligne renvoyées par l'API", async () => {
    vi.mocked(api.post).mockResolvedValue({
      created: 0, updated: 0, skipped: 1, errors: [{ index: 0, message: 'Filiale déjà existante' }],
    });
    const { user } = await openImportDialog();

    const csv = 'nom;nom_affiche;adresse;siret;active;logo_base64;cachet_base64\nFresse GDO;;;;;;\n';
    const file = new File([csv], 'filiales.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);
    await user.click(await screen.findByRole('button', { name: 'Importer (1)' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ligne 2 : Filiale déjà existante')).toBeInTheDocument();
  });
});
