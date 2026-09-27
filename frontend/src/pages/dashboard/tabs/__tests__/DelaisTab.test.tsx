import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { delaisFixture } from '../../__tests__/kpi-fixtures';
import { DelaisTab } from '../DelaisTab';

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

const ROUTE = '/dashboard?from=2026-08-27&to=2026-09-25';

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockReset();
  mockRole = 'admin';
});

function mockGet(path: string, body: unknown) {
  vi.mocked(api.get).mockImplementation((p: string) => (p.startsWith(path) ? Promise.resolve(body) : Promise.resolve([])));
}

describe('DelaisTab', () => {
  it('appelle /kpi/delais avec la période de l’adresse et écrit la portée de chaque carte', async () => {
    mockGet('/kpi/delais', delaisFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    expect(await screen.findByLabelText(/^Bons créés : 12 bons, du 27\/08 au 25\/09/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/kpi/delais?from=2026-08-27&to=2026-09-25');
  });

  it('un pourcentage montre son effectif', async () => {
    mockGet('/kpi/delais', delaisFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    expect(await screen.findAllByText('6 remises sur 7 signées')).toHaveLength(1);
    expect(screen.getAllByText('85,7 % (6 sur 7)').length).toBeGreaterThan(0);
  });

  it('les barres du délai tracent la médiane du tableau, en heures, sans jargon', async () => {
    mockGet('/kpi/delais', delaisFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    const bars = await screen.findByRole('list', { name: 'Délai médian par document' });
    expect(within(bars).getByText('Restitution').nextSibling).toHaveTextContent('24 h');
    expect(screen.getByText('9 sur 10 signés en moins de')).toBeInTheDocument();
    expect(screen.queryByText(/p90/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mandataire/)).not.toBeInTheDocument();
  });

  it('« Signature en retard » : état du jour, lien vers la liste pour l’IT, pas pour la direction', async () => {
    mockGet('/kpi/delais', delaisFixture());
    const { unmount } = renderWithProviders(<DelaisTab />, { route: ROUTE });
    expect(await screen.findByRole('link', { name: /^Signature en retard : 3 bons, au 25\/09/ }))
      .toHaveAttribute('href', '/bons?overdue=1');
    unmount();
    mockRole = 'direction';
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    expect(await screen.findByLabelText(/^Signature en retard : 3 bons, au 25\/09/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Signature en retard/ })).not.toBeInTheDocument();
  });

  it('avec une filiale, « Signature en retard » ouvre les bons de cette filiale', async () => {
    mockGet('/kpi/delais', delaisFixture());
    renderWithProviders(<DelaisTab />, { route: `${ROUTE}&filialeId=f1` });
    expect(await screen.findByRole('link', { name: /^Signature en retard/ }))
      .toHaveAttribute('href', '/bons?overdue=1&filialeId=f1');
  });

  it('IT : les volumes ouvrent leur liste exacte ; direction : aucune liste de bons, le « ? » dit pourquoi', async () => {
    mockGet('/kpi/delais', delaisFixture());
    const { unmount } = renderWithProviders(<DelaisTab />, { route: ROUTE });
    for (const [name, key] of [[/^Bons créés/, 'bons_crees'], [/^Bons envoyés/, 'bons_envoyes'],
      [/^Bons clôturés/, 'bons_clotures'], [/^Bons annulés/, 'bons_annules']] as const) {
      const href = (await screen.findByRole('link', { name })).getAttribute('href') ?? '';
      expect(new URL(href, 'http://localhost').searchParams.get('liste')).toBe(key);
    }
    // Une médiane ou une part n'est pas une liste : pas de lien.
    expect(screen.queryByRole('link', { name: /^Délai entre création et envoi/ })).not.toBeInTheDocument();
    unmount();

    mockRole = 'direction';
    const { user } = renderWithProviders(<DelaisTab />, { route: ROUTE });
    await screen.findByLabelText(/^Bons créés/);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Pourquoi pas de liste : Bons créés' }));
    expect(screen.getByText(/n'accède pas aux bons/)).toBeInTheDocument();
  });

  it('le tableau des signatures attendues donne le seuil', async () => {
    mockGet('/kpi/delais', delaisFixture());
    renderWithProviders(<DelaisTab />, { route: ROUTE });
    const table = await screen.findByRole('table', { name: 'Signatures attendues par document' });
    expect(within(table).getByText('En retard (plus de 10 j)')).toBeInTheDocument();
    expect(within(table).getByText('Remise à signer')).toBeInTheDocument();
  });
});
