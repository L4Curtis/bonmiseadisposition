import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { UtilisateursPage } from '../../Utilisateurs';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      getList: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      getBlob: vi.fn(),
      getFile: vi.fn(),
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1', role: 'admin', displayName: 'Admin', email: 'admin@example.com',
      isItStaff: true, isLocalAccount: true, mustChangePassword: false, active: true, samAccountName: 'admin',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  resetActiveFilialesForTests();
  vi.mocked(api.getList).mockResolvedValue({ items: [], total: 0, page: 1, limit: 25, truncated: false, meta: { directoryActive: true } });
  vi.mocked(api.get).mockResolvedValue([]);
});

async function openMenu() {
  const { user } = renderWithProviders(<UtilisateursPage />);
  await user.click(await screen.findByRole('button', { name: /Autres actions/ }));
  return { user };
}

describe('Import / export CSV des collaborateurs créés à la main', () => {
  it('montre un aperçu, importe, puis affiche le compte rendu ligne par ligne', async () => {
    vi.mocked(api.post).mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [{ index: 1, message: "Ce compte provient de l'annuaire" }],
      lines: [
        { index: 0, status: 'created', samAccountName: 'manuel.jean.dupont', displayName: 'Jean DUPONT' },
        { index: 1, status: 'error', samAccountName: 'jdupont', message: "Ce compte provient de l'annuaire" },
      ],
    });
    const { user } = await openMenu();
    await user.click(await screen.findByRole('menuitem', { name: /Importer un CSV/ }));
    const dialog = await screen.findByRole('dialog');

    const csv = 'identifiant;prenom;nom;email;service;filiale;actif\n'
      + ';Jean;Dupont;;Chantier;;oui\n'
      + 'jdupont;Jean;Dupont;;;;\n'
      + ';Jean;DUPONT;;;;\n';
    await user.upload(within(dialog).getByLabelText('Fichier CSV à importer'), new File([csv], 'c.csv', { type: 'text/csv' }));

    expect(await within(dialog).findByText('2 ligne(s) valide(s) prête(s) à importer.')).toBeInTheDocument();
    expect(within(dialog).getByText('Création')).toBeInTheDocument();
    expect(within(dialog).getByText('Mise à jour (jdupont)')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ligne 4 : Doublon de la ligne 2/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Importer (2)' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users/manual/import', {
      items: [
        {
          samAccountName: undefined, firstName: 'Jean', lastName: 'Dupont', email: undefined,
          department: 'Chantier', filiale: undefined, active: true,
        },
        {
          samAccountName: 'jdupont', firstName: 'Jean', lastName: 'Dupont', email: undefined,
          department: undefined, filiale: undefined, active: undefined,
        },
      ],
    }));
    expect(await within(dialog).findByText(/Créés : 1 · Mis à jour : 0 · Ignorés : 0 · Erreurs : 1/)).toBeInTheDocument();
    const report = within(dialog).getByRole('list', { name: 'Compte rendu ligne par ligne' });
    expect(within(report).getByText(/Ligne 3/)).toBeInTheDocument();
    expect(within(report).getByText('Erreur')).toBeInTheDocument();
  });

  it("annonce le nombre de comptes créés à la main, puis télécharge l'export généré par le serveur", async () => {
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a,b'], { type: 'text/csv' }), filename: 'export.csv', truncated: false });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(api.getList).mockImplementation(async (path: string) => ({
      items: [], total: path.includes('origin=manual') ? 3 : 0, page: 1, limit: 25, truncated: false, meta: { directoryActive: true },
    }));

    const { user } = renderWithProviders(<UtilisateursPage />);
    await user.click(await screen.findByRole('button', { name: 'Exporter CSV' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('3 comptes créés à la main')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('quels que soient les filtres de la liste');
    expect(api.getList).toHaveBeenCalledWith('/users?origin=manual&status=all&page=1&limit=25', expect.anything());
    expect(api.getFile).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^Exporter$/ }));
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith('/users/manual/export'));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('télécharge le modèle généré par le serveur', async () => {
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a,b'], { type: 'text/csv' }), filename: 'modele.csv', truncated: false });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = await openMenu();
    expect(screen.queryByRole('menuitem', { name: /Exporter/ })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: /Télécharger un modèle/ }));
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith('/users/manual/import/template'));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
