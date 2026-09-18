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
  {
    id: 'c2', category: 'ecran', brand: 'Dell', model: 'P2422H', active: true,
  },
  {
    id: 'c3', category: 'souris', brand: 'Logitech', model: 'MX Master 3', active: false,
  },
];

const packs = [
  {
    id: 'p1', name: 'Pack nouveau collaborateur', active: true, items: [],
  },
  {
    id: 'p2', name: 'Pack ancien modèle', active: false, items: [],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/equipment/catalog') return Promise.resolve(catalogItems);
    if (path === '/equipment/packs') return Promise.resolve(packs);
    return Promise.resolve(null);
  });
});

describe('CataloguePage', () => {
  it('charge et affiche le catalogue des equipements actifs, masque les desactives par defaut', async () => {
    renderWithProviders(<CataloguePage />);

    expect(await screen.findByText('Lenovo')).toBeInTheDocument();
    expect(screen.getByText('ThinkBook 16 G6')).toBeInTheDocument();
    expect(screen.getByText('Dell')).toBeInTheDocument();
    // Logitech (desactive) est masque par le filtre d'etat par defaut (Actifs)
    expect(screen.queryByText('Logitech')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/equipment/catalog');
    expect(api.get).toHaveBeenCalledWith('/equipment/packs');
  });

  it('affiche le nombre d\'elements sur les onglets Catalogue et Packs', async () => {
    renderWithProviders(<CataloguePage />);

    expect(await screen.findByRole('tab', { name: 'Catalogue (3)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Packs (2)' })).toBeInTheDocument();
  });

  it('le filtre d\'etat affiche les equipements desactives sur demande, avec un badge', async () => {
    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');

    expect(screen.queryByText('Désactivé')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer par état'), 'all');

    expect(await screen.findByText('Logitech')).toBeInTheDocument();
    expect(screen.getByText('Désactivé')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer par état'), 'inactive');

    expect(screen.getByText('Logitech')).toBeInTheDocument();
    expect(screen.queryByText('Lenovo')).not.toBeInTheDocument();
  });

  it('affiche les packs sous l\'onglet Packs', async () => {
    const { user } = renderWithProviders(<CataloguePage />);

    await screen.findByText('Lenovo');
    await user.click(screen.getByRole('tab', { name: /Packs/ }));

    expect(await screen.findByText('Pack nouveau collaborateur')).toBeInTheDocument();
  });

  it('masque les packs desactives par defaut, le filtre d\'etat les affiche', async () => {
    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');
    await user.click(screen.getByRole('tab', { name: /Packs/ }));

    await screen.findByText('Pack nouveau collaborateur');
    expect(screen.queryByText('Pack ancien modèle')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer les packs par état'), 'all');

    expect(await screen.findByText('Pack ancien modèle')).toBeInTheDocument();
  });

  it("propose une action « Désactiver » (pas « Supprimer ») pour un équipement actif, « Réactiver » pour un desactive", async () => {
    const { user } = renderWithProviders(<CataloguePage />);

    await screen.findByText('Lenovo');
    expect(screen.getByRole('button', { name: 'Désactiver Lenovo ThinkBook 16 G6' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer par état'), 'all');
    expect(await screen.findByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
  });

  it('filtre le catalogue par la recherche texte (anti-rebond)', async () => {
    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');

    await user.type(screen.getByLabelText('Rechercher un équipement du catalogue'), 'Dell');

    await waitFor(() => expect(screen.queryByText('Lenovo')).not.toBeInTheDocument());
    expect(screen.getByText('Dell')).toBeInTheDocument();
  });

  it('filtre le catalogue par catégorie', async () => {
    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');

    await user.selectOptions(screen.getByLabelText('Filtrer par catégorie'), 'ecran');

    expect(screen.queryByText('Lenovo')).not.toBeInTheDocument();
    expect(screen.getByText('Dell')).toBeInTheDocument();
  });

  it('recherche sans resultat : propose de reinitialiser les filtres', async () => {
    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');

    await user.type(screen.getByLabelText('Rechercher un équipement du catalogue'), 'introuvable');

    expect(await screen.findByText('Aucun équipement ne correspond à la recherche')).toBeInTheDocument();
    const resetButton = screen.getByRole('button', { name: 'Réinitialiser les filtres' });

    await user.click(resetButton);
    expect(await screen.findByText('Lenovo')).toBeInTheDocument();
  });

  it('catalogue vide : propose d\'ajouter un equipement ou d\'importer un CSV', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/equipment/catalog') return Promise.resolve([]);
      if (path === '/equipment/packs') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithProviders(<CataloguePage />);

    expect(await screen.findByText('Le catalogue est vide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger le modèle CSV' })).toBeInTheDocument();
  });

  it('pagine la table du catalogue au-delà de 10 équipements', async () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      category: 'autre',
      brand: 'Marque',
      model: `Modele-${String(i).padStart(2, '0')}`,
      active: true,
    }));
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/equipment/catalog') return Promise.resolve(manyItems);
      if (path === '/equipment/packs') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    const { user } = renderWithProviders(<CataloguePage />);

    await screen.findByText('Modele-00');
    expect(screen.queryByText('Modele-11')).not.toBeInTheDocument();
    // Le texte « Page 1 sur 2 » est réparti sur plusieurs éléments (nombres
    // dans des <span> imbriqués) : on compare le textContent complet plutôt
    // que le texte direct utilisé par le matcher par défaut de getByText.
    expect(screen.getByText((_, el) => el?.textContent === 'Page 1 sur 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page suivante' }));

    expect(await screen.findByText('Modele-11')).toBeInTheDocument();
    expect(screen.queryByText('Modele-00')).not.toBeInTheDocument();
  });

  it('telecharge le modele CSV depuis la barre d\'outils', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = renderWithProviders(<CataloguePage />);
    await screen.findByText('Lenovo');

    await user.click(screen.getByRole('button', { name: 'Modèle CSV' }));
    expect(URL.createObjectURL).toHaveBeenCalled();

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });

  it('duplique un pack existant avec un nouveau nom', async () => {
    const duplicated = { id: 'p3', name: 'Pack nouveau collaborateur (copie)', active: true, items: [] };
    vi.mocked(api.post).mockResolvedValue(duplicated);
    const { user } = renderWithProviders(<CataloguePage />);

    await screen.findByText('Lenovo');
    await user.click(screen.getByRole('tab', { name: /Packs/ }));
    await screen.findByText('Pack nouveau collaborateur');

    await user.click(screen.getByRole('button', { name: 'Dupliquer le pack Pack nouveau collaborateur' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Nom du nouveau pack')).toHaveValue('Pack nouveau collaborateur (copie)');

    await user.click(within(dialog).getByRole('button', { name: 'Dupliquer' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/equipment/packs', {
      name: 'Pack nouveau collaborateur (copie)',
      items: [],
    }));
  });
});
