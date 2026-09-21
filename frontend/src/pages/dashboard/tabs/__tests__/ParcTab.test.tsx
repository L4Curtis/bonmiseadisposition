import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { ParcKpiResponse } from '../../types/parc';
import { ParcTab } from '../ParcTab';

// jsdom ne calcule pas de mise en page réelle : ResponsiveContainer (recharts)
// est remplacé par un conteneur de taille fixe (même pattern que charts.test.tsx).
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

const ROUTE = '/dashboard?tab=parc&from=2026-08-18&to=2026-09-16';

const fixture: ParcKpiResponse = {
  period: { from: '2026-08-18', to: '2026-09-16', granularity: 'day', days: 30 },
  previous: { from: '2026-07-19', to: '2026-08-17' },
  filialeId: null,
  loaned: {
    total: 212,
    bons: 143,
    byCategory: [
      { category: 'pc_portable', label: 'PC portable', count: 120 },
      { category: 'ecran', label: 'Écran', count: 92 },
    ],
    byFiliale: [
      { filialeId: 'f1', name: 'Paris', count: 140 },
      { filialeId: 'f2', name: 'Lyon', count: 72 },
    ],
    topModels: [
      { catalogItemId: 'c1', label: 'Dell Latitude 5540', category: 'pc_portable', count: 31 },
      { catalogItemId: 'c2', label: 'Dell 24" P2422H', category: 'ecran', count: 18 },
    ],
    offCatalogShare: 0.08,
    serialCoverage: 0.93,
    series: [
      { bucket: '2026-08-18', count: 198 },
      { bucket: '2026-09-16', count: 212 },
    ],
  },
  returnOverdue: {
    bons: 9,
    equipments: 14,
    avgDays: 12.4,
    medianDays: 8,
    top: [
      {
        bonId: 'b1',
        reference: 'BMD-2026-0042',
        filiale: 'Paris',
        collaborateur: 'Jean Dupont',
        dateRestitution: '2026-09-01',
        daysLate: 15,
        equipments: 3,
      },
    ],
  },
  notReturned: {
    declared: { current: 4, previous: 6 },
    found: { current: 1, previous: 2 },
    closedBonsShare: { current: 0.032, previous: 0.041 },
    openNow: 7,
  },
};

function mockApiGet(response: ParcKpiResponse) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/kpi/parc')) return Promise.resolve(response);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockReset();
  mockRole = 'admin';
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

describe('ParcTab', () => {
  it('calls /kpi/parc with from/to in the URL and no filialeId when absent', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    await screen.findByText('Évolution du parc prêté');
    const call = vi.mocked(api.get).mock.calls.find(([p]) => p.startsWith('/kpi/parc'));
    expect(call?.[0]).toContain('from=2026-08-18');
    expect(call?.[0]).toContain('to=2026-09-16');
    expect(call?.[0]).not.toContain('filialeId');
  });

  it('includes filialeId in the /kpi/parc call when present in the URL', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });

    await screen.findByText('Évolution du parc prêté');
    const call = vi.mocked(api.get).mock.calls.find(([p]) => p.startsWith('/kpi/parc'));
    expect(call?.[0]).toContain('filialeId=f1');
  });

  it('renders the tile values (formatNumber/formatPercent), the average-delay hint and the danger tone', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    await screen.findByText('Évolution du parc prêté');

    expect(screen.getByLabelText('Équipements prêtés : 212')).toBeInTheDocument();

    const overdueTile = screen.getByLabelText('Retards de restitution : 14');
    expect(within(overdueTile).getByText('moy. 12,4 j')).toBeInTheDocument();
    expect(within(overdueTile).getByText('14').className).toContain('text-destructive');

    expect(screen.getByLabelText('Non rendus déclarés : 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Retrouvés : 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Part hors catalogue : 8 %')).toBeInTheDocument();
    expect(screen.getByLabelText('Couverture n° de série : 93 %')).toBeInTheDocument();
  });

  it('shows a delta AND the "n bons" hint on the loaned-equipment tile when the series has at least two points', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    const tile = await screen.findByLabelText('Équipements prêtés : 212');
    expect(within(tile).getByText(/vs période précédente/)).toBeInTheDocument();
    // La tuile affiche désormais le delta ET l'indication (StatCard ne les exclut plus).
    expect(within(tile).getByText('143 bons')).toBeInTheDocument();
  });

  it('falls back to the "n bons" hint on the loaned-equipment tile when the series has fewer than two points', async () => {
    mockApiGet({ ...fixture, loaned: { ...fixture.loaned, series: [{ bucket: '2026-09-16', count: 212 }] } });
    renderWithProviders(<ParcTab />, { route: ROUTE });

    const tile = await screen.findByLabelText('Équipements prêtés : 212');
    expect(within(tile).getByText('143 bons')).toBeInTheDocument();
    expect(within(tile).queryByText(/vs période précédente/)).not.toBeInTheDocument();
  });

  it('renders the chart card titles', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    expect(await screen.findByText('Évolution du parc prêté')).toBeInTheDocument();
    expect(screen.getByText('Répartition par catégorie')).toBeInTheDocument();
    expect(screen.getByText('Par filiale')).toBeInTheDocument();
    expect(screen.getByText('Modèles les plus prêtés')).toBeInTheDocument();
    expect(screen.getByText('Retards de restitution (top 10)')).toBeInTheDocument();
  });

  it('navigates to the filtered inventory when a filiale bar is clicked', async () => {
    mockApiGet(fixture);
    const { user } = renderWithProviders(<ParcTab />, { route: ROUTE });

    // "Paris" apparaît deux fois (barre par filiale + table des retards) :
    // seule la barre est un bouton cliquable.
    const parisMatches = await screen.findAllByText('Paris');
    const parisButton = parisMatches.find((el) => el.closest('button'));
    expect(parisButton).toBeTruthy();

    await user.click(parisButton as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith('/inventaire?filialeId=f1');
  });

  it('renders the overdue-returns table with a bon link for IT roles', async () => {
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    const link = await screen.findByRole('link', { name: 'BMD-2026-0042' });
    expect(link).toHaveAttribute('href', '/bons/b1');
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders the bon reference as plain text (no link) for the direction role', async () => {
    mockRole = 'direction';
    mockApiGet(fixture);
    renderWithProviders(<ParcTab />, { route: ROUTE });

    await screen.findByText('BMD-2026-0042');
    expect(screen.queryByRole('link', { name: 'BMD-2026-0042' })).not.toBeInTheDocument();
  });

  it('shows "Aucun retard" when the overdue-returns list is empty', async () => {
    mockApiGet({ ...fixture, returnOverdue: { ...fixture.returnOverdue, top: [] } });
    renderWithProviders(<ParcTab />, { route: ROUTE });

    expect(await screen.findByText('Aucun retard')).toBeInTheDocument();
  });

  it('shows an error message with a retry button that calls the API again', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Panne réseau'));
    const { user } = renderWithProviders(<ParcTab />, { route: ROUTE });

    expect(await screen.findByText('Panne réseau')).toBeInTheDocument();
    expect(screen.queryByText('Évolution du parc prêté')).not.toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Réessayer' });
    vi.mocked(api.get).mockClear();
    mockApiGet(fixture);
    await user.click(retryButton);

    expect(await screen.findByText('Évolution du parc prêté')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalled();
  });

  it('exports the inventory CSV via api.getBlob with the current filiale filter', async () => {
    mockApiGet(fixture);
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
    const { user } = renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });

    await screen.findByText('Évolution du parc prêté');
    const exportButton = screen.getByRole('button', { name: /Exporter l'inventaire \(CSV\)/ });
    await user.click(exportButton);

    expect(api.getBlob).toHaveBeenCalledWith('/reporting/inventory/export?filialeId=f1');
  });
});
