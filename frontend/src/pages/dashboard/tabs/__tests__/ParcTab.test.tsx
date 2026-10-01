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

  it('chaque état du jour ouvre l’inventaire filtré sur ce qu’il compte, pour la direction aussi', async () => {
    mockRole = 'direction';
    const fixture = parcFixture();
    mockGet('/kpi/parc', { ...fixture, loaned: { ...fixture.loaned, offCatalogShare: 0.1 } });
    renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });

    expect(await screen.findByRole('link', { name: /^Encore non restitués : 2 équipements/ }))
      .toHaveAttribute('href', '/inventaire?situation=non_restitue&filialeId=f1');
    expect(screen.getByRole('link', { name: /^Hors catalogue : .*Voir les 6 équipements hors catalogue$/ }))
      .toHaveAttribute('href', '/inventaire?horsCatalogue=1&filialeId=f1');
    expect(screen.getByRole('link', { name: /^Avec numéro de série : .*Voir les 6 équipements sans numéro$/ }))
      .toHaveAttribute('href', '/inventaire?sansNumeroSerie=1&filialeId=f1');
  });

  it('un seul équipement : accords au singulier (« saisi », « Voir l’équipement »)', async () => {
    const fixture = parcFixture();
    // 61 équipements : 1/61 hors catalogue, 60/61 avec un numéro.
    mockGet('/kpi/parc', { ...fixture, loaned: { ...fixture.loaned, offCatalogShare: 1 / 61, serialCoverage: 60 / 61 } });
    renderWithProviders(<ParcTab />, { route: ROUTE });
    expect(await screen.findByText('1 équipement saisi en texte libre')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir l'équipement hors catalogue$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir l'équipement sans numéro$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Voir les 1 /)).not.toBeInTheDocument();
  });

  it('rien à lister (100 % avec numéro, 0 % hors catalogue) : pas de lien, le « ? » dit pourquoi', async () => {
    const fixture = parcFixture();
    mockGet('/kpi/parc', { ...fixture, loaned: { ...fixture.loaned, offCatalogShare: 0, serialCoverage: 1 } });
    const { user } = renderWithProviders(<ParcTab />, { route: ROUTE });
    await screen.findByLabelText(/^Avec numéro de série : 100/);
    expect(screen.queryByRole('link', { name: /^(Avec numéro de série|Hors catalogue)/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Définition : Avec numéro de série' }));
    await user.click(screen.getByRole('button', { name: 'Définition : Hors catalogue' }));
    expect(screen.getByText(/aucun équipement sans numéro à lister/)).toBeInTheDocument();
    expect(screen.getByText(/n'est saisi en texte libre : il n'y a rien à lister/)).toBeInTheDocument();
  });

  it('les flux d’équipements (journal) n’ont pas de lien et disent pourquoi sous « ? »', async () => {
    mockGet('/kpi/parc', parcFixture());
    const { user } = renderWithProviders(<ParcTab />, { route: ROUTE });
    const declared = await screen.findByLabelText(/^Équipements déclarés non restitués : 3 équipements/);
    expect(declared.closest('a')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Définition : Équipements retrouvés' }));
    expect(screen.getByText(/compte des déclarations passées/)).toBeInTheDocument();
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
    // La ligne compte les équipements en retard DE CE BON : l'inventaire est
    // filtré sur sa référence, pas sur le collaborateur (qui peut en avoir d'autres).
    const row = await screen.findByRole('link', { name: 'Voir les équipements en retard du bon BON-2026-0045' });
    expect(row.getAttribute('href')).toBe('/inventaire?overdue=1&search=BON-2026-0045');
    expect(screen.queryByRole('link', { name: /Ouvrir le bon/ })).not.toBeInTheDocument();
  });

  it('n’exporte plus l’inventaire : l’onglet exporte ses indicateurs (en tête de page)', async () => {
    mockGet('/kpi/parc', parcFixture());
    renderWithProviders(<ParcTab />, { route: `${ROUTE}&filialeId=f1` });
    await screen.findByText('Modèles les plus prêtés');
    expect(screen.queryByRole('button', { name: /Exporter l'inventaire/ })).not.toBeInTheDocument();
  });

  it('montre une erreur avec « Réessayer »', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));
    renderWithProviders(<ParcTab />, { route: ROUTE });
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
