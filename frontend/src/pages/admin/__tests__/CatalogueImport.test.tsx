import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CataloguePage } from '../Catalogue';

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

const catalogItems = [
  {
    id: 'c1', category: 'pc_portable', brand: 'Lenovo', model: 'ThinkBook 16 G6', active: true,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/equipment/catalog') return Promise.resolve(catalogItems);
    if (path === '/equipment/packs') return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

async function openImportDialog(): Promise<{ user: ReturnType<typeof renderWithProviders>['user'] }> {
  const { user } = renderWithProviders(<CataloguePage />);
  await screen.findByText('Lenovo');
  await user.click(screen.getByRole('button', { name: /Importer un CSV/ }));
  await screen.findByRole('dialog');
  return { user };
}

describe("Import CSV du catalogue", () => {
  it('affiche un aperçu et importe un fichier CSV valide', async () => {
    vi.mocked(api.post).mockResolvedValue({
      created: 1, updated: 1, skipped: 0, errors: [],
    });
    const { user } = await openImportDialog();

    const csv = 'categorie;marque;modele;description\n'
      + 'pc_portable;Lenovo;ThinkPad X1;\n'
      + 'ecran;Dell;U2720Q;Ecran 27"\n';
    const file = new File([csv], 'catalogue.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);

    expect(await screen.findByText('2 ligne(s) valide(s) prête(s) à importer.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importer (2)' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/equipment/catalog/import', {
      items: [
        { category: 'pc_portable', brand: 'Lenovo', model: 'ThinkPad X1', description: '' },
        { category: 'ecran', brand: 'Dell', model: 'U2720Q', description: 'Ecran 27"' },
      ],
    }));

    expect(await screen.findByText('Créés : 1 · Réactivés : 1 · Ignorés : 0')).toBeInTheDocument();
    // Le catalogue seul est rechargé après un import réussi (jamais les packs)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/equipment/catalog'));
  });

  it('rejette les lignes invalides (catégorie inconnue, marque manquante) avant tout appel API', async () => {
    const { user } = await openImportDialog();

    const csv = 'categorie;marque;modele;description\n'
      + 'zzz_invalide;Lenovo;ThinkPad X1;\n'
      + 'pc_fixe;;Optiplex;\n';
    const file = new File([csv], 'invalide.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);

    expect(await screen.findByText('2 ligne(s) ignorée(s)')).toBeInTheDocument();
    expect(screen.getByText(/Ligne 2 : Catégorie inconnue/)).toBeInTheDocument();
    expect(screen.getByText(/Ligne 3 : Marque et modèle obligatoires/)).toBeInTheDocument();

    const importButton = screen.getByRole('button', { name: 'Importer (0)' });
    expect(importButton).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("affiche les erreurs ligne par ligne renvoyées par l'API", async () => {
    vi.mocked(api.post).mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 1,
      errors: [{ index: 0, message: 'Article déjà existant' }],
    });
    const { user } = await openImportDialog();

    const csv = 'categorie;marque;modele;description\npc_portable;Lenovo;ThinkPad X1;\n';
    const file = new File([csv], 'catalogue.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Fichier CSV à importer'), file);
    await user.click(await screen.findByRole('button', { name: 'Importer (1)' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ligne 2 : Article déjà existant')).toBeInTheDocument();
  });
});
