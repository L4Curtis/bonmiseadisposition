import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ConfigHealthCard, type ConfigHealthSection } from '../ConfigHealthCard';

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

const sections: ConfigHealthSection[] = [
  { key: 'general', label: 'Général', state: 'configure', detail: "URL publique de l'application configurée.", updatedAt: '2026-02-01T00:00:00Z' },
  { key: 'smtp', label: 'Email / SMTP', state: 'incomplet', detail: 'SMTP incomplet (port manquant) : aucun lien de signature ne part, seule la signature présentielle fonctionne.', updatedAt: null },
  { key: 'smb', label: 'Export SMB', state: 'desactive', detail: 'Export SMB désactivé : les bons ne sont pas copiés vers un partage réseau.', updatedAt: '2026-01-15T00:00:00Z' },
  { key: 'entra', label: 'Entra ID', state: 'non_configure', detail: 'Entra ID non configuré : seule la connexion locale est disponible, pas de SSO Microsoft.', updatedAt: null },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ConfigHealthCard', () => {
  it("charge et affiche l'état de chaque rubrique avec son détail", async () => {
    vi.mocked(api.get).mockResolvedValue({ sections });

    renderWithProviders(<ConfigHealthCard />);

    expect(await screen.findByText('Général')).toBeInTheDocument();
    expect(screen.getByText('Email / SMTP')).toBeInTheDocument();
    expect(screen.getByText(/aucun lien de signature ne part/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/config/health');
  });

  it('affiche le libellé français de chaque état', async () => {
    vi.mocked(api.get).mockResolvedValue({ sections });

    renderWithProviders(<ConfigHealthCard />);

    await screen.findByText('Général');
    expect(screen.getByText('Configuré')).toBeInTheDocument();
    expect(screen.getByText('Incomplet')).toBeInTheDocument();
    expect(screen.getByText('Désactivé')).toBeInTheDocument();
    expect(screen.getByText('Non configuré')).toBeInTheDocument();
  });

  it('mène vers la rubrique concernée via un lien', async () => {
    vi.mocked(api.get).mockResolvedValue({ sections });

    renderWithProviders(<ConfigHealthCard />);

    const link = await screen.findByRole('link', { name: /Email \/ SMTP/ });
    expect(link).toHaveAttribute('href', '/admin/configuration/smtp');
  });

  it("affiche 'Jamais modifié' quand updatedAt est nul", async () => {
    vi.mocked(api.get).mockResolvedValue({ sections });

    renderWithProviders(<ConfigHealthCard />);

    await screen.findByText('Général');
    expect(screen.getAllByText('Jamais modifié').length).toBeGreaterThan(0);
  });

  it('affiche une erreur avec un bouton réessayer en cas d\'échec', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Erreur réseau'));

    renderWithProviders(<ConfigHealthCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur réseau');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('recharge les données au clic sur Réessayer', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Erreur réseau'));
    vi.mocked(api.get).mockResolvedValueOnce({ sections });

    const { user } = renderWithProviders(<ConfigHealthCard />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Général')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
