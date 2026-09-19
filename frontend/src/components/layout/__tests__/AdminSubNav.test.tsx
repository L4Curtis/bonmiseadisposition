import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminSubNav, getSubNavForPath } from '../AdminSubNav';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn() },
  };
});

import { api } from '@/lib/api';
import { resetConfigHealthForTests } from '@/hooks/use-config-health';

const configSection = getSubNavForPath('/admin/configuration/general')!;
const templatesSection = getSubNavForPath('/admin/templates/email')!;

beforeEach(() => {
  vi.resetAllMocks();
  // Le hook use-config-health mutualise l'état entre tous les composants
  // montés via un store de module : sans ce reset, un test hériterait des
  // données (ou de l'erreur) laissées par le test précédent.
  resetConfigHealthForTests();
});

describe('AdminSubNav', () => {
  it("charge l'état de configuration et affiche une pastille par rubrique", async () => {
    vi.mocked(api.get).mockResolvedValue({
      sections: [
        { key: 'general', label: 'Général', state: 'configure', detail: '', updatedAt: null },
        { key: 'smtp', label: 'Email / SMTP', state: 'incomplet', detail: '', updatedAt: null },
        { key: 'smb', label: 'Export SMB', state: 'desactive', detail: '', updatedAt: null },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/admin/configuration/general']}>
        <AdminSubNav section={configSection} />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('Configuré')).not.toHaveLength(0);
    expect(screen.getAllByText('Incomplet').length).toBeGreaterThan(0);
    // "Monitoring SMB" reprend l'état de la rubrique "smb" (pas de clés propres)
    const monitoringLink = screen.getByRole('link', { name: /Monitoring SMB/ });
    expect(monitoringLink).toHaveTextContent('Désactivé');
  });

  it("n'appelle pas /admin/config/health pour la sous-navigation Modèles", () => {
    render(
      <MemoryRouter initialEntries={['/admin/templates/email']}>
        <AdminSubNav section={templatesSection} />
      </MemoryRouter>,
    );

    expect(api.get).not.toHaveBeenCalled();
  });

  it('affiche le menu même si le chargement des états échoue', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network'));

    render(
      <MemoryRouter initialEntries={['/admin/configuration/general']}>
        <AdminSubNav section={configSection} />
      </MemoryRouter>,
    );

    // findBy (plutôt que getBy) attend que le rejet de la requête partagée soit
    // pris en compte, pour ne pas laisser de mise à jour d'état hors act().
    expect(await screen.findByRole('link', { name: /Général/ })).toBeInTheDocument();
  });
});
