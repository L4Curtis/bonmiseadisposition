import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { incidentsFixture } from '../../__tests__/kpi-fixtures';
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

const ROUTE = '/dashboard?from=2026-08-27&to=2026-09-25';

beforeEach(() => {
  vi.resetAllMocks();
  mockRole = 'admin';
});

function mockGet(path: string, body: unknown) {
  vi.mocked(api.get).mockImplementation((p: string) => (p.startsWith(path) ? Promise.resolve(body) : Promise.resolve([])));
}

describe('IncidentsTab', () => {
  it('appelle /kpi/incidents avec la période et la filiale', async () => {
    mockGet('/kpi/incidents', incidentsFixture());
    renderWithProviders(<IncidentsTab />, { route: `${ROUTE}&filialeId=f1` });
    await screen.findByText('État du jour');
    expect(api.get).toHaveBeenCalledWith('/kpi/incidents?from=2026-08-27&to=2026-09-25&filialeId=f1');
  });

  it('compte des équipements, sépare remises et clôtures sans signature, contestations reçues et à traiter', async () => {
    mockGet('/kpi/incidents', incidentsFixture());
    renderWithProviders(<IncidentsTab />, { route: ROUTE });
    expect(await screen.findByLabelText(/^Encore non restitués : 2 équipements, au 25\/09/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Équipements déclarés non restitués : 3 équipements, du 27\/08/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Remises constatées sans signature : 1 bon,/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Clôturés sans signature : 1 bon,/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contestations reçues : 3 contestations,/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Contestations à traiter : 1 contestation, au 25\/09/ }))
      .toHaveAttribute('href', '/admin/contestations?aTraiter=1');
    expect(screen.getByText('Tablette en panne')).toBeInTheDocument();
    expect(screen.getByText('Parti avant de signer')).toBeInTheDocument();
    expect(screen.queryByText(/unilatérale|Taux d'acceptation/)).not.toBeInTheDocument();
  });

  it('issues Fondée / Non retenue', async () => {
    mockGet('/kpi/incidents', incidentsFixture());
    renderWithProviders(<IncidentsTab />, { route: ROUTE });
    expect(await screen.findByLabelText(/^Fondée : 1 contestation/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Non retenue : 1 contestation/)).toBeInTheDocument();
  });

  it('rappels : message plutôt qu’un graphique vide quand aucun rappel n’est parti', async () => {
    const data = incidentsFixture();
    mockGet('/kpi/incidents', {
      ...data,
      reminders: { ...data.reminders, byRank: data.reminders.byRank.map((r) => ({ ...r, sent: { current: 0, previous: 0 } })) },
    });
    renderWithProviders(<IncidentsTab />, { route: ROUTE });
    expect(await screen.findByText('Aucun rappel envoyé sur la période.')).toBeInTheDocument();
  });

  it('lien vers la supervision pour l’admin seulement ; pas de lien vers les contestations pour la direction', async () => {
    mockGet('/kpi/incidents', incidentsFixture());
    const { unmount } = renderWithProviders(<IncidentsTab />, { route: ROUTE });
    expect(await screen.findByRole('link', { name: 'Voir la supervision' })).toBeInTheDocument();
    unmount();
    mockRole = 'direction';
    renderWithProviders(<IncidentsTab />, { route: ROUTE });
    await screen.findByText('État du jour');
    expect(screen.queryByRole('link', { name: 'Voir la supervision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Contestations à traiter/ })).not.toBeInTheDocument();
  });

  describe('tuile = liste', () => {
    it('IT : chaque carte ouvre sa liste exacte (bons annulés : la liste des bons filtrée), période et filiale gardées', async () => {
      mockGet('/kpi/incidents', incidentsFixture());
      renderWithProviders(<IncidentsTab />, { route: `${ROUTE}&tab=incidents&filialeId=f1` });
      const expected: [RegExp, string][] = [
        [/^PV de non-restitution émis/, 'pv_emis'],
        [/^Remises constatées sans signature/, 'remises_sans_signature'],
        [/^Clôturés sans signature/, 'clotures_sans_signature'],
        [/^Contestations reçues/, 'contestations_recues'],
        [/^Emails en échec/, 'emails_en_echec'],
        [/^Fondée/, 'contestations_fondees'],
        [/^Non retenue/, 'contestations_non_retenues'],
      ];
      await screen.findByText('État du jour');
      for (const [name, key] of expected) {
        const href = screen.getByRole('link', { name }).getAttribute('href') ?? '';
        const params = new URL(href, 'http://localhost').searchParams;
        expect(new URL(href, 'http://localhost').pathname).toBe('/dashboard');
        expect(params.get('liste')).toBe(key);
        expect(params.get('filialeId')).toBe('f1');
        expect(params.get('from')).toBe('2026-08-27');
        expect(params.get('tab')).toBe('incidents');
      }
      expect(screen.getByRole('link', { name: /^Bons annulés/ }))
        .toHaveAttribute('href', '/bons?cancelledFrom=2026-08-27&cancelledTo=2026-09-25&filialeId=f1');
      expect(screen.getByRole('link', { name: /^Encore non restitués : 2 équipements/ }))
        .toHaveAttribute('href', '/inventaire?situation=non_restitue&filialeId=f1');
    });

    it('avec une filiale, « Contestations à traiter » ne mène pas à la page non filtrée', async () => {
      mockGet('/kpi/incidents', incidentsFixture());
      renderWithProviders(<IncidentsTab />, { route: `${ROUTE}&filialeId=f1` });
      await screen.findByText('État du jour');
      expect(screen.queryByRole('link', { name: /Contestations à traiter/ })).not.toBeInTheDocument();
    });

    it('direction : l’inventaire des non-restitués, jamais une liste de bons ; le « ? » dit pourquoi', async () => {
      mockRole = 'direction';
      mockGet('/kpi/incidents', incidentsFixture());
      const { user } = renderWithProviders(<IncidentsTab />, { route: ROUTE });
      await screen.findByText('État du jour');
      const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      expect(links).toEqual(['/inventaire?situation=non_restitue']);
      await user.click(screen.getByRole('button', { name: 'Pourquoi pas de liste : Bons annulés' }));
      expect(screen.getByText(/n'accède pas aux bons/)).toBeInTheDocument();
    });

    it('direction : le « ? » d’« Emails en échec », de « Fondée » et de « Non retenue » ne parle pas de « bons comptés »', async () => {
      mockRole = 'direction';
      mockGet('/kpi/incidents', incidentsFixture());
      const { user } = renderWithProviders(<IncidentsTab />, { route: ROUTE });
      await screen.findByText('État du jour');
      for (const label of ['Emails en échec', 'Fondée', 'Non retenue']) {
        await user.click(screen.getByRole('button', { name: `Définition : ${label}` }));
      }
      expect(screen.getAllByText(/La liste de ce chiffre mène aux bons concernés/)).toHaveLength(3);
      expect(screen.queryByText(/compte des bons/)).not.toBeInTheDocument();
    });

    it('« Délai de décision » : une médiane, sans liste, et le « ? » le dit', async () => {
      mockGet('/kpi/incidents', incidentsFixture());
      const { user } = renderWithProviders(<IncidentsTab />, { route: ROUTE });
      await screen.findByText('État du jour');
      expect(screen.queryByRole('link', { name: /^Délai de décision/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Définition : Délai de décision' }));
      expect(screen.getByText(/médiane calculée sur les contestations tranchées : il n'ouvre pas de liste/)).toBeInTheDocument();
    });
  });
});
