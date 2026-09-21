import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DelaisTab } from '../DelaisTab';
import type { DelaisKpiResponse } from '../../types/delais';

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

const navigateMock = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
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
      isItStaff: mockRole === 'admin' || mockRole === 'technician',
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

function buildFixture(overrides: Partial<DelaisKpiResponse> = {}): DelaisKpiResponse {
  return {
    period: { from: '2026-08-18', to: '2026-09-16', granularity: 'day', days: 30 },
    previous: { from: '2026-07-19', to: '2026-08-17' },
    filialeId: null,
    volumes: {
      created: { current: 58, previous: 61 },
      sent: { current: 52, previous: 60 },
      archived: { current: 44, previous: 50 },
      cancelled: { current: 3, previous: 1 },
      series: [
        { bucket: '2026-08-18', created: 3, sent: 2, archived: 1 },
        { bucket: '2026-08-19', created: 1, sent: 1, archived: 0 },
      ],
    },
    statusBreakdown: [
      { status: 'draft', label: 'Brouillon', count: 0 },
      { status: 'sent_mise_dispo', label: 'En attente de signature', count: 5 },
      { status: 'active', label: 'Actif', count: 120 },
      { status: 'sent_restitution', label: 'En attente de restitution', count: 3 },
      { status: 'partially_returned', label: 'Restitution partielle', count: 0 },
      { status: 'contested', label: 'Contesté', count: 0 },
      { status: 'archived', label: 'Archivé', count: 44 },
      { status: 'cancelled', label: 'Annulé', count: 3 },
    ],
    creationToSend: { count: 52, medianHours: 5.2, p90Hours: 48.1, previous: { medianHours: 6.0, p90Hours: 50.2 } },
    sendToSignature: {
      mise_disposition: {
        count: 48, medianHours: 20.5, p90Hours: 96, within48h: 0.71, within7d: 0.92,
        previous: { medianHours: 24, p90Hours: 110, within48h: 0.66, within7d: 0.9 },
      },
      restitution: {
        count: 10, medianHours: 30, p90Hours: 60, within48h: 0.5, within7d: 0.8,
        previous: { medianHours: 32, p90Hours: 62, within48h: 0.45, within7d: 0.75 },
      },
      pv_cloture: {
        count: 5, medianHours: 40, p90Hours: 80, within48h: 0.4, within7d: 0.7,
        previous: { medianHours: 42, p90Hours: 85, within48h: 0.35, within7d: 0.65 },
      },
    },
    signatureMode: {
      inPerson: { current: 12, previous: 9 },
      remote: { current: 40, previous: 44 },
      proxy: { current: 2, previous: 1 },
    },
    loanDuration: { count: 44, avgDays: { current: 84.2, previous: 90.1 }, medianDays: { current: 70, previous: 75 } },
    waiting: {
      thresholdDays: 7,
      overdueTotal: 6,
      steps: [
        { step: 'mise_disposition', label: 'Signature mise à disposition', count: 12, avgAgeDays: 4.1, overdue: 3 },
        { step: 'restitution', label: 'Signature restitution', count: 5, avgAgeDays: 2, overdue: 1 },
        { step: 'pv_cloture', label: 'PV de clôture', count: 2, avgAgeDays: 9.5, overdue: 2 },
      ],
    },
    ...overrides,
  };
}

const ROUTE = '/dashboard?tab=delais&from=2026-08-18&to=2026-09-16&filialeId=f1';

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockReset();
  mockRole = 'admin';
});

describe('DelaisTab', () => {
  it('calls GET /kpi/delais with from/to/filialeId from the URL and renders the volume tiles', async () => {
    vi.mocked(api.get).mockResolvedValue(buildFixture());

    renderWithProviders(<DelaisTab />, { route: ROUTE });

    await screen.findByText('Bons créés');

    const calledPath = vi.mocked(api.get).mock.calls[0][0] as string;
    expect(calledPath).toContain('/kpi/delais?');
    expect(calledPath).toContain('from=2026-08-18');
    expect(calledPath).toContain('to=2026-09-16');
    expect(calledPath).toContain('filialeId=f1');

    // Rangée 1 : volumes formatés + delta vs période précédente. Les tuiles
    // ont un aria-label unique « label : valeur » (le libellé seul peut
    // apparaître ailleurs, ex. la légende du graphique des volumes).
    expect(screen.getByLabelText('Bons créés : 58')).toBeInTheDocument();
    expect(screen.getByLabelText('Envoyés : 52')).toBeInTheDocument();
    expect(screen.getByLabelText('Archivés : 44')).toBeInTheDocument();
    expect(screen.getByLabelText('Annulés : 3')).toBeInTheDocument();
    expect(screen.getAllByText(/vs période précédente/).length).toBeGreaterThan(0);
  });

  it('shows the overdue-signature tile with the threshold from the API and navigates to /bons?overdue=1 for an admin', async () => {
    vi.mocked(api.get).mockResolvedValue(buildFixture());
    const { user } = renderWithProviders(<DelaisTab />, { route: ROUTE });

    const overdueCard = await screen.findByRole('button', { name: /En retard de signature \(> 7 j\)/ });
    await user.click(overdueCard);

    expect(navigateMock).toHaveBeenCalledWith('/bons?overdue=1');
  });

  it('renders the overdue-signature tile without a button for the direction role', async () => {
    mockRole = 'direction';
    vi.mocked(api.get).mockResolvedValue(buildFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });

    await screen.findByText('En retard de signature (> 7 j)');
    expect(screen.queryByRole('button', { name: /En retard de signature/ })).not.toBeInTheDocument();
  });

  it('renders the chart card titles, the signature-mode tiles and the waiting-steps table', async () => {
    vi.mocked(api.get).mockResolvedValue(buildFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });

    await screen.findByText('Volumes sur la période');
    expect(screen.getByText('Répartition par statut')).toBeInTheDocument();
    expect(screen.getByText('Délai envoi → signature par type')).toBeInTheDocument();
    expect(screen.getByText('Mode de signature')).toBeInTheDocument();
    expect(screen.getByText('En attente par étape')).toBeInTheDocument();

    // Mode de signature.
    expect(screen.getByText('Présentiel')).toBeInTheDocument();
    expect(screen.getByText('Distant')).toBeInTheDocument();
    expect(screen.getByText('Mandataire')).toBeInTheDocument();

    // Table des étapes en attente.
    expect(screen.getByText('Signature mise à disposition')).toBeInTheDocument();
    expect(screen.getByText('Signature restitution')).toBeInTheDocument();
    // « PV de clôture » apparaît deux fois : table des étapes en attente et
    // table de détail du délai envoi → signature par type.
    expect(screen.getAllByText('PV de clôture').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the empty state for the waiting-steps table when there is nothing waiting', async () => {
    vi.mocked(api.get).mockResolvedValue(buildFixture({
      waiting: {
        thresholdDays: 7,
        overdueTotal: 0,
        steps: [
          { step: 'mise_disposition', label: 'Signature mise à disposition', count: 0, avgAgeDays: null, overdue: 0 },
          { step: 'restitution', label: 'Signature restitution', count: 0, avgAgeDays: null, overdue: 0 },
          { step: 'pv_cloture', label: 'PV de clôture', count: 0, avgAgeDays: null, overdue: 0 },
        ],
      },
    }));
    renderWithProviders(<DelaisTab />, { route: ROUTE });

    expect(await screen.findByText('Aucun bon en attente.')).toBeInTheDocument();
  });

  it('shows a single error state with a retry button, which re-fetches on click', async () => {
    // Erreur sans message exploitable : errorMessage() retombe sur le
    // message de repli passé à useApiResource.
    vi.mocked(api.get).mockRejectedValueOnce(new Error());
    const { user } = renderWithProviders(<DelaisTab />, { route: ROUTE });

    expect(await screen.findByText('Impossible de charger les indicateurs de délais')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Réessayer' });

    vi.mocked(api.get).mockResolvedValueOnce(buildFixture());
    await user.click(retryButton);

    expect(await screen.findByText('Bons créés')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('re-fetches with the new dates when the period changes in the URL', async () => {
    vi.mocked(api.get).mockResolvedValue(buildFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    await screen.findByText('Bons créés');
    const firstPath = vi.mocked(api.get).mock.calls[0][0] as string;

    vi.mocked(api.get).mockClear();
    vi.mocked(api.get).mockResolvedValue(buildFixture());
    renderWithProviders(<DelaisTab />, {
      route: '/dashboard?tab=delais&from=2026-01-01&to=2026-01-31&filialeId=f2',
    });
    await screen.findByText('Bons créés');
    const secondPath = vi.mocked(api.get).mock.calls[0][0] as string;

    expect(secondPath).not.toBe(firstPath);
    expect(secondPath).toContain('from=2026-01-01');
    expect(secondPath).toContain('to=2026-01-31');
    expect(secondPath).toContain('filialeId=f2');
  });
});
