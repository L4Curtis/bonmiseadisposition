import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PdfTemplatesPage } from '../PdfTemplates';

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
      postForm: vi.fn(),
      patchForm: vi.fn(),
    },
  };
});

import { api } from '@/lib/api';

const templates = [
  {
    id: 'tpl-1',
    name: 'Mise à disposition',
    description: 'Modele standard',
    documentType: 'mise_disposition',
    variables: [],
    isCustomized: false,
  },
  {
    id: 'tpl-2',
    name: 'Restitution',
    description: 'Modele de restitution',
    documentType: 'restitution',
    variables: [],
    isCustomized: true,
  },
];

/** Réponse de liste à la forme unique de l'API. */
function listOf<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: items.length, truncated: false };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getList).mockImplementation((path: string) =>
    Promise.resolve(listOf(path === '/pdf-templates' ? templates : [])) as never,
  );
  vi.mocked(api.get).mockResolvedValue(null);
});

describe('PdfTemplatesPage', () => {
  it('charge et affiche la liste des modeles PDF', async () => {
    renderWithProviders(<PdfTemplatesPage />);

    expect(await screen.findByText('Mise à disposition')).toBeInTheDocument();
    expect(screen.getByText('Restitution')).toBeInTheDocument();
    expect(api.getList).toHaveBeenCalledWith('/pdf-templates');
  });

  it('affiche le badge "Personnalisé" uniquement pour les modeles personnalises', async () => {
    renderWithProviders(<PdfTemplatesPage />);

    await screen.findByText('Restitution');
    expect(screen.getAllByText('Personnalisé')).toHaveLength(1);
  });
});
