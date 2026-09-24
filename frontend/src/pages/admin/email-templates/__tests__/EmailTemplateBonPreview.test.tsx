import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { EmailTemplatePreview } from '../EmailTemplatePreview';
import { EmailTemplateTestDialog } from '../EmailTemplateTestDialog';
import type { TemplateDefinition } from '../types';

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

const signatureTemplate: TemplateDefinition = {
  id: 'mise_disposition_request',
  name: 'Bon de mise à disposition — À signer',
  description: 'Envoyé au collaborateur',
  category: 'signature',
  recipient: 'Collaborateur',
  headerColor: '#D8372B',
  variables: [],
  isCustomized: false,
};

const departureTemplate: TemplateDefinition = {
  ...signatureTemplate,
  id: 'departure_alert',
  name: 'Alerte — Départs avec matériel',
  category: 'depart',
};

const BON = {
  id: '11111111-2222-3333-4444-555555555555',
  reference: 'BON-2026-0107',
  status: 'active',
  collaborateurName: 'Claire Martin',
  filialeName: 'Livio Nord',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.endsWith('/preview')) return Promise.resolve({ html: '<p>exemple</p>' });
    if (path.startsWith('/admin/email-templates/preview-bons')) return Promise.resolve([BON]);
    if (path.includes('/preview-bon/')) {
      return Promise.resolve({
        html: '<p>reel</p>',
        subject: '[BON-2026-0107] Bon de mise à disposition à signer — Livio Nord',
        reference: 'BON-2026-0107',
        sampleVariables: ['REMINDER_NUMBER'],
      });
    }
    return Promise.resolve(null);
  });
});

describe('EmailTemplatePreview — aperçu avec un bon réel', () => {
  it('affiche d’abord les données d’exemple', async () => {
    renderWithProviders(<EmailTemplatePreview template={signatureTemplate} open onClose={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/email-templates/mise_disposition_request/preview'));
    expect(screen.getByRole('button', { name: "Données d'exemple" })).toHaveAttribute('aria-pressed', 'true');
  });

  it('recherche un bon par référence puis rend le modèle avec ses données', async () => {
    const { user } = renderWithProviders(<EmailTemplatePreview template={signatureTemplate} open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Un bon réel' }));
    await user.type(screen.getByLabelText('Bon à utiliser (recherche par référence)'), '0107');

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/email-templates/preview-bons?q=0107'));
    const results = await screen.findByRole('list', { name: 'Bons trouvés' });
    await user.click(within(results).getByRole('button', { name: /BON-2026-0107/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      `/admin/email-templates/mise_disposition_request/preview-bon/${BON.id}`,
    ));
    expect(await screen.findByText(/Le lien de signature est factice/)).toBeInTheDocument();
    expect(screen.getByText('[BON-2026-0107] Bon de mise à disposition à signer — Livio Nord')).toBeInTheDocument();
    expect(screen.getByText('{{REMINDER_NUMBER}}')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('ne propose pas de bon pour un modèle qui ne porte pas sur un bon', async () => {
    renderWithProviders(<EmailTemplatePreview template={departureTemplate} open onClose={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/email-templates/departure_alert/preview'));
    expect(screen.queryByRole('button', { name: 'Un bon réel' })).not.toBeInTheDocument();
  });
});

describe('EmailTemplateTestDialog — test avec un bon réel', () => {
  it('envoie le test avec le bon choisi', async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true, message: 'Email de test envoyé à admin@livio.fr.' });
    const { user } = renderWithProviders(<EmailTemplateTestDialog template={signatureTemplate} open onClose={vi.fn()} />);

    const send = screen.getByRole('button', { name: 'Envoyer le test' });
    await user.click(screen.getByLabelText("Utiliser les données d'un vrai bon"));
    expect(send).toBeDisabled();

    const results = await screen.findByRole('list', { name: 'Bons trouvés' });
    await user.click(await within(results).findByRole('button', { name: /BON-2026-0107/ }));
    await user.click(send);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/admin/email-templates/mise_disposition_request/test-bon',
      { email: 'admin@livio.fr', bonId: BON.id },
    ));
  });

  it('garde l’envoi avec les données d’exemple par défaut', async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true, message: 'ok' });
    const { user } = renderWithProviders(<EmailTemplateTestDialog template={signatureTemplate} open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Envoyer le test' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/admin/email-templates/mise_disposition_request/test',
      { email: 'admin@livio.fr' },
    ));
  });
});
