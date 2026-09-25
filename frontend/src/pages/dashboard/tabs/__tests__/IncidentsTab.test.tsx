import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { IncidentsKpiResponse } from '../../types/incidents';
import { IncidentsTab } from '../IncidentsTab';

// jsdom ne calcule pas de mise en page réelle : ResponsiveContainer est
// remplacé par un conteneur de taille fixe, comme dans charts.test.tsx.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => (
      <div style={{ width: 800, height: 300 }}>
        {isValidElement(children) ? cloneElement(children, { width: 800, height: 300 } as object) : children}
      </div>
    ),
  };
});

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

let mockRole = 'admin';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      role: mockRole,
      displayName: 'Test User',
      email: 't@example.com',
      isItStaff: true,
      isLocalAccount: true,
      mustChangePassword: false,
      active: true,
      samAccountName: 'test',
    },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

const fixture: IncidentsKpiResponse = {
  period: { from: '2026-08-18', to: '2026-09-17', granularity: 'day', days: 30 },
  previous: { from: '2026-07-19', to: '2026-08-17' },
  filialeId: null,
  notReturned: { declared: { current: 4, previous: 6 }, found: { current: 1, previous: 2 } },
  pvCloture: { emitted: { current: 3, previous: 2 } },
  unilateralClosures: {
    count: { current: 2, previous: 0 },
    reasons: [
      { reason: 'Collaborateur parti', count: 2 },
      { reason: 'Non renseigné', count: 1 },
    ],
  },
  cancellations: { count: { current: 3, previous: 1 } },
  contestations: {
    opened: { current: 2, previous: 1 },
    openNow: 1,
    closed: { current: 2, previous: 1 },
    resolutionMedianDays: { current: 1.5, previous: 3 },
    acceptanceRate: { current: 0.5, previous: 1 },
  },
  reminders: {
    byRank: [
      { rank: 1, sent: { current: 20, previous: 25 }, signedAfter: { current: 8, previous: 9 }, efficiency: 0.4 },
      { rank: 2, sent: { current: 12, previous: 10 }, signedAfter: { current: 5, previous: 4 }, efficiency: 0.4167 },
      { rank: 3, sent: { current: 5, previous: 6 }, signedAfter: { current: 1, previous: 2 }, efficiency: 0.2 },
    ],
    bonsWithThreeOrMore: { current: 3, previous: 5 },
  },
  failedEmails: { count: { current: 3, previous: 1 } },
};

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'admin';
});

describe('IncidentsTab', () => {
  it('calls /kpi/incidents with from/to/filialeId in the URL', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    renderWithProviders(<IncidentsTab />, { route: '/dashboard?tab=incidents&from=2026-08-18&to=2026-09-17&filialeId=fil-1' });

    await screen.findByText('Non restitués déclarés');
    expect(api.get).toHaveBeenCalledTimes(1);
    const calledPath = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(calledPath).toContain('/kpi/incidents?');
    expect(calledPath).toContain('from=2026-08-18');
    expect(calledPath).toContain('to=2026-09-17');
    expect(calledPath).toContain('filialeId=fil-1');
  });

  it('renders the 6 stat tiles with values, the "en cours" hint, and deltas', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    renderWithProviders(<IncidentsTab />);

    expect(await screen.findByText('Non restitués déclarés')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Retrouvés')).toBeInTheDocument();
    expect(screen.getByText('PV de non-restitution émis')).toBeInTheDocument();
    expect(screen.getByText('Clôtures unilatérales')).toBeInTheDocument();
    expect(screen.getByText('Annulations')).toBeInTheDocument();
    expect(screen.getByText('Contestations ouvertes')).toBeInTheDocument();

    // hint « n en cours » dérivé de contestations.openNow
    expect(screen.getByText('1 en cours')).toBeInTheDocument();

    // deltas vs période précédente (calculés par StatCard/computeDelta)
    expect(screen.getAllByText(/% vs période précédente/).length).toBeGreaterThan(0);
  });

  it('shows the monitoring link on "Emails en échec" for an admin, but not for a technician', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    const { rerender } = renderWithProviders(<IncidentsTab />);
    expect(await screen.findByText('Emails en échec')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le monitoring' })).toHaveAttribute('href', '/admin/configuration/monitoring');

    mockRole = 'technician';
    rerender(<IncidentsTab />);
    await screen.findByText('Emails en échec');
    expect(screen.queryByRole('link', { name: 'Voir le monitoring' })).not.toBeInTheDocument();
  });

  it('renders the card titles', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    renderWithProviders(<IncidentsTab />);

    expect(await screen.findByText('Contestations')).toBeInTheDocument();
    expect(screen.getByText('Rappels par rang')).toBeInTheDocument();
    expect(screen.getByText('Motifs de clôture unilatérale')).toBeInTheDocument();
  });

  it('renders the 3 reminder ranks with sent/signedAfter values and the summary tiles', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    renderWithProviders(<IncidentsTab />);

    expect((await screen.findAllByText('1er rappel')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2e rappel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3e rappel').length).toBeGreaterThan(0);

    expect(screen.getByText('Efficacité du 1er rappel')).toBeInTheDocument();
    expect(screen.getByText('Bons avec ≥ 3 rappels')).toBeInTheDocument();
  });

  it('lists the unilateral closure reasons', async () => {
    vi.mocked(api.get).mockResolvedValue(fixture);

    renderWithProviders(<IncidentsTab />);

    expect(await screen.findByText('Collaborateur parti')).toBeInTheDocument();
    expect(screen.getByText('Non renseigné')).toBeInTheDocument();
  });

  it('shows a single error message with a retry button on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error());

    const { user } = renderWithProviders(<IncidentsTab />);

    expect(await screen.findByText("Impossible de charger les indicateurs d'incidents")).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Réessayer' });
    expect(retryButton).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValue(fixture);
    await user.click(retryButton);
    expect(await screen.findByText('Non restitués déclarés')).toBeInTheDocument();
  });
});
