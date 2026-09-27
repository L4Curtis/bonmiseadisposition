import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { parcFixture } from '../../__tests__/kpi-fixtures';
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
      getFile: vi.fn(),
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

const ROUTE = '/dashboard?from=2026-08-27&to=2026-09-25';

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockReset();
  mockRole = 'admin';
});

function mockGet(path: string, body: unknown) {
  vi.mocked(api.get).mockImplementation((p: string) => (p.startsWith(path) ? Promise.resolve(body) : Promise.resolve([])));
}

describe('ParcTab', () => {
  it('appelle /kpi/parc avec la période et la filiale de l’adresse', async () => {
    mockGet('/kpi/parc', parcFixture());
    renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });
    await screen.findByText('État du jour');
    expect(api.get).toHaveBeenCalledWith('/kpi/parc?from=2026-08-27&to=2026-09-25&filialeId=f1');
  });

  it('sépare l’état du jour (au 25/09) et la période, avec unités, et ouvre l’inventaire filtré', async () => {
    mockGet('/kpi/parc', parcFixture());
    renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });
    const loaned = await screen.findByRole('link', { name: /^Équipements chez les collaborateurs : 61 équipements, au 25\/09/ });
    expect(loaned).toHaveAttribute('href', '/inventaire?filialeId=f1');
    expect(screen.getByRole('link', { name: /^Retour en retard : 6 équipements, au 25\/09/ }))
      .toHaveAttribute('href', '/inventaire?overdue=1&filialeId=f1');
    expect(screen.getByText('sur 3 bons, retard moyen 10,3 j par bon')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Équipements déclarés non restitués : 3 équipements, du 27\/08 au 25\/09/)).toBeInTheDocument();
    // Un état du jour n'a pas de comparaison avec la période précédente.
    expect(loaned).not.toHaveTextContent('vs période précédente');
  });

  it('dit que le dernier point de la courbe est l’état d’aujourd’hui quand la période finit aujourd’hui', async () => {
    // « Aujourd'hui » = dernier jour de la période de la fixture (25/09) : seule
    // la date est simulée, les minuteries de findBy restent réelles.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
    try {
      mockGet('/kpi/parc', parcFixture());
      renderWithProviders(<ParcTab />, { route: '/dashboard' });
      expect(await screen.findByText(/Le dernier point est l'état d'aujourd'hui, égal à la carte/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('IT : les lignes du retard mènent au bon ; direction : à l’inventaire filtré, jamais au bon', async () => {
    mockGet('/kpi/parc', parcFixture());
    const { unmount } = renderWithProviders(<ParcTab />, { route: ROUTE });
    expect(await screen.findByRole('link', { name: 'Ouvrir le bon BON-2026-0045' })).toHaveAttribute('href', '/bons/b9');
    unmount();

    mockRole = 'direction';
    renderWithProviders(<ParcTab />, { route: ROUTE });
    const row = await screen.findByRole('link', { name: 'Voir les équipements en retard de Hugo Petit' });
    expect(row.getAttribute('href')).toBe('/inventaire?overdue=1&search=Hugo+Petit');
    expect(screen.queryByRole('link', { name: /Ouvrir le bon/ })).not.toBeInTheDocument();
  });

  it('exporte le CSV de l’inventaire avec le filtre filiale courant', async () => {
    mockGet('/kpi/parc', parcFixture());
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['a'], { type: 'text/csv' }), filename: 'export.csv', truncated: false });
    const { user } = renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });
    await user.click(await screen.findByRole('button', { name: /Exporter l'inventaire de la filiale \(CSV\)/ }));
    expect(api.getFile).toHaveBeenCalledWith('/reporting/inventory/export?filialeId=f1');
  });

  it('montre une erreur avec « Réessayer »', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    renderWithProviders(<ParcTab />, { route: ROUTE });
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
