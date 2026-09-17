import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TemplatesPage } from '../Templates';

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

const templates = [
  {
    id: 'tpl-1',
    name: 'Demande de signature',
    description: 'Envoye au collaborateur',
    category: 'signature' as const,
    recipient: 'Collaborateur',
    headerColor: '#2563eb',
    variables: [],
    isCustomized: false,
  },
  {
    id: 'tpl-2',
    name: 'Litige équipement',
    description: 'Envoye a l\'IT',
    category: 'contestation' as const,
    recipient: 'IT',
    headerColor: '#dc2626',
    variables: [],
    isCustomized: true,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/admin/email-templates') return Promise.resolve(templates);
    return Promise.resolve(null);
  });
});

describe('TemplatesPage', () => {
  it('charge et affiche la liste des templates email', async () => {
    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('Demande de signature')).toBeInTheDocument();
    expect(screen.getByText('Litige équipement')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/email-templates');
  });

  it('affiche le libelle de categorie pour chaque template', async () => {
    renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('Contestation')).toBeInTheDocument();
  });
});
