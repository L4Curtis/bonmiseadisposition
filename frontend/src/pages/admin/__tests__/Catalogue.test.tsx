import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
    id: 'c2', category: 'ecran', brand: 'Dell', model: 'P2422H', active: false,
  },
];

const packs = [
  {
    id: 'p1', name: 'Pack nouveau collaborateur', active: true, items: [],
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
  it('charge et affiche le catalogue des equipements', async () => {
    renderWithProviders(<CataloguePage />);

    expect(await screen.findByText('Lenovo')).toBeInTheDocument();
    expect(screen.getByText('ThinkBook 16 G6')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/equipment/catalog');
    expect(api.get).toHaveBeenCalledWith('/equipment/packs');
  });

  it('affiche les packs sous l\'onglet Packs', async () => {
    const { user } = renderWithProviders(<CataloguePage />);

    await screen.findByText('Lenovo');
    await user.click(screen.getByRole('button', { name: 'Packs' }));

    expect(await screen.findByText('Pack nouveau collaborateur')).toBeInTheDocument();
  });
});
