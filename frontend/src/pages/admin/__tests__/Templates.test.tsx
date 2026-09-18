import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', email: 'admin@livio.fr', displayName: 'Admin Livio' },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

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
    recipient: 'Staff IT',
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
    // { selector: 'div' } cible le badge de la ligne, pas l'option du filtre catégorie
    expect(screen.getByText('Signature', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Contestation', { selector: 'div' })).toBeInTheDocument();
  });

  it('affiche le titre et le sous-titre correctement accentués', async () => {
    renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    expect(screen.getByText("Modèles d'emails")).toBeInTheDocument();
    expect(screen.getByText('Personnalisez les emails automatiques envoyés par l\'application')).toBeInTheDocument();
  });

  it('affiche le badge "Personnalisé" uniquement pour les templates modifiés', async () => {
    renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    expect(screen.getAllByText('Personnalisé')).toHaveLength(1);
  });

  it('filtre la liste par la recherche texte (titre, description)', async () => {
    const { user } = renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    await user.type(screen.getByLabelText("Rechercher un modèle d'email"), 'Litige');

    expect(screen.queryByText('Demande de signature')).not.toBeInTheDocument();
    expect(screen.getByText('Litige équipement')).toBeInTheDocument();
  });

  it('filtre la liste par catégorie', async () => {
    const { user } = renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    await user.selectOptions(screen.getByLabelText('Filtrer par catégorie'), 'contestation');

    expect(screen.queryByText('Demande de signature')).not.toBeInTheDocument();
    expect(screen.getByText('Litige équipement')).toBeInTheDocument();
  });

  it('envoie un email de test avec l\'adresse de l\'administrateur connecté proposée par défaut', async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true, message: 'Email de test envoyé à admin@livio.fr.' });
    const { user } = renderWithProviders(<TemplatesPage />);

    await screen.findByText('Demande de signature');
    await user.click(screen.getAllByTitle('Envoyer un test')[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Adresse email destinataire')).toHaveValue('admin@livio.fr');

    await user.click(within(dialog).getByRole('button', { name: 'Envoyer le test' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/admin/email-templates/tpl-1/test',
      { email: 'admin@livio.fr' },
    ));
  });
});
