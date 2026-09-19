import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ScheduledJobsCard, type AdminStatus } from '../ScheduledJobsCard';

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

const baseStatus: AdminStatus = {
  version: '1.4.0',
  commit: 'a1b2c3d',
  uptimeSeconds: 3600,
  database: 'ok',
  jobs: [
    {
      job: 'ldap-sync',
      label: 'Synchronisation LDAP',
      schedule: 'toutes les 6 h',
      lastStartedAt: '2026-09-19T06:00:00.000Z',
      lastFinishedAt: '2026-09-19T06:00:05.000Z',
      lastStatus: 'success',
      lastError: null,
      lastDurationMs: 5234,
      late: false,
    },
    {
      job: 'signature-reminders',
      label: 'Rappels de signature',
      schedule: 'les jours ouvrés à 9 h',
      lastStartedAt: '2026-09-19T09:00:00.000Z',
      lastFinishedAt: '2026-09-19T09:00:01.000Z',
      lastStatus: 'skipped',
      lastError: null,
      lastDurationMs: 12,
      late: false,
    },
    {
      job: 'smb-retry',
      label: 'Relance des exports SMB',
      schedule: 'toutes les 6 h',
      lastStartedAt: '2026-09-18T00:00:00.000Z',
      lastFinishedAt: '2026-09-18T00:00:02.000Z',
      lastStatus: 'error',
      lastError: 'Chemin SMB inaccessible',
      lastDurationMs: 2000,
      late: false,
    },
    {
      job: 'retention',
      label: 'Rétention RGPD',
      schedule: 'le dimanche à 3 h',
      lastStartedAt: '2026-09-01T03:00:00.000Z',
      lastFinishedAt: '2026-09-01T03:05:00.000Z',
      lastStatus: 'success',
      lastError: null,
      lastDurationMs: 300000,
      late: true,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ScheduledJobsCard', () => {
  it('charge et affiche une ligne par tâche planifiée avec son libellé et sa fréquence', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    expect(await screen.findByText('Synchronisation LDAP')).toBeInTheDocument();
    expect(screen.getByText('Rappels de signature')).toBeInTheDocument();
    expect(screen.getByText('Relance des exports SMB')).toBeInTheDocument();
    expect(screen.getByText('Rétention RGPD')).toBeInTheDocument();
    // "toutes les 6 h" est partagée par ldap-sync et smb-retry
    expect(screen.getAllByText('toutes les 6 h')).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith('/admin/status');
  });

  it('affiche la pastille OK pour une tâche réussie et récente', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    await screen.findByText('Synchronisation LDAP');
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('affiche la pastille "Désactivée" et pas le message d\'erreur pour une tâche skipped', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    await screen.findByText('Rappels de signature');
    expect(screen.getByText('Désactivée')).toBeInTheDocument();
  });

  it('affiche la pastille "Erreur" avec le message pour une tâche en échec', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    await screen.findByText('Relance des exports SMB');
    expect(screen.getByText('Erreur')).toBeInTheDocument();
    expect(screen.getByText('Chemin SMB inaccessible')).toBeInTheDocument();
  });

  it('affiche la pastille "En retard" quand late est vrai', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    await screen.findByText('Rétention RGPD');
    expect(screen.getByText('En retard')).toBeInTheDocument();
  });

  it('affiche la version et le commit en pied de carte', async () => {
    vi.mocked(api.get).mockResolvedValue(baseStatus);

    renderWithProviders(<ScheduledJobsCard />);

    expect(await screen.findByText(/Version 1\.4\.0/)).toBeInTheDocument();
    expect(screen.getByText(/commit a1b2c3d/)).toBeInTheDocument();
  });

  it('affiche une erreur avec un bouton réessayer en cas d\'échec', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Erreur réseau'));

    renderWithProviders(<ScheduledJobsCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur réseau');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('recharge les données au clic sur Réessayer', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Erreur réseau'));
    vi.mocked(api.get).mockResolvedValueOnce(baseStatus);

    const { user } = renderWithProviders(<ScheduledJobsCard />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Synchronisation LDAP')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
