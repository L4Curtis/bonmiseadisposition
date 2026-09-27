import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TodayTab } from '../TodayTab';
import { todayFixture } from '../../__tests__/kpi-fixtures';

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

let mockRole = 'technician';

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

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockReset();
  mockRole = 'technician';
});

function mockApi(today = todayFixture()) {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/kpi/aujourdhui')) return Promise.resolve(today);
    if (path.startsWith('/bons/recent')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
}

function linkTo(name: RegExp): HTMLElement {
  return screen.getByRole('link', { name });
}

describe('TodayTab', () => {
  it('lit un seul appel /kpi/aujourdhui, sans période', async () => {
    mockApi();
    renderWithProviders(<TodayTab />);
    await screen.findByText('Signatures attendues');
    expect(api.get).toHaveBeenCalledWith('/kpi/aujourdhui');
    expect(vi.mocked(api.get).mock.calls.some(([p]) => String(p).startsWith('/bons/stats'))).toBe(false);
  });

  it('chaque tuile écrit son unité, sa portée et ouvre la liste qui applique le même prédicat', async () => {
    mockApi();
    renderWithProviders(<TodayTab />);
    await screen.findByText('Signatures attendues');

    expect(linkTo(/^Signature en retard : 3 bons, au 25\/09/)).toHaveAttribute('href', '/bons?overdue=1');
    expect(linkTo(/^Retour en retard : 6 équipements/)).toHaveAttribute('href', '/inventaire?overdue=1');
    expect(linkTo(/^Contestations à traiter : 2 contestations/)).toHaveAttribute('href', '/admin/contestations?aTraiter=1');
    expect(linkTo(/^Liens expirés : 1 bon,/)).toHaveAttribute('href', '/bons?linkExpired=1');
    expect(linkTo(/^Départs avec matériel : 1 collaborateur/)).toHaveAttribute('href', '/inventaire?vue=collaborateurs&compte=inactif');
    expect(linkTo(/^Signatures attendues : 11 bons/)).toHaveAttribute('href', '/bons?awaitingSignature=1');
    expect(linkTo(/^Bons ouverts : 40 bons/)).toHaveAttribute('href', '/bons?excludeStatus=cancelled,archived');
    expect(screen.getByText('signature attendue depuis plus de 10 jours')).toBeInTheDocument();
    expect(screen.getByText('sur 3 bons, date de retour dépassée')).toBeInTheDocument();
  });

  it('« À traiter » : sections non vides, total avec unité, lignes vers le bon et « Voir tout » vers la liste', async () => {
    mockApi();
    renderWithProviders(<TodayTab />);
    const section = await screen.findByRole('region', { name: 'Contestations à traiter' });
    expect(section).toHaveTextContent('Contestations à traiter (2 contestations)');
    expect(section).toHaveTextContent("Léa Martin · En cours d'examen");
    expect(screen.getByRole('link', { name: /BON-2026-0021/ })).toHaveAttribute('href', '/bons/b2');
    expect(screen.queryByRole('region', { name: 'Brouillons jamais envoyés' })).not.toBeInTheDocument();
    const seeAll = screen.getAllByRole('link', { name: /Voir tout/ }).map((a) => a.getAttribute('href'));
    expect(seeAll).toContain('/admin/contestations?aTraiter=1');
    expect(seeAll).toContain('/bons?overdue=1');
  });

  it('« Restitution partielle à signer » : total en bons, ligne vers le bon et « Voir tout » vers la liste filtrée par sous-état', async () => {
    const base = todayFixture();
    mockApi({
      ...base,
      toDo: {
        ...base.toDo,
        partialRestitutionsToSign: {
          total: 1,
          rows: [{ bonId: 'b9', reference: 'BON-2026-0090', collaborateurId: 'u9', collaborateur: 'Hugo Petit',
            since: '2026-09-20T08:00:00.000Z', detail: '2 équipements à signer' }],
        },
      },
    });
    renderWithProviders(<TodayTab />);
    const section = await screen.findByRole('region', { name: 'Restitution partielle à signer' });
    expect(section).toHaveTextContent('Restitution partielle à signer (1 bon)');
    expect(section).toHaveTextContent('Hugo Petit · 2 équipements à signer');
    expect(screen.getByRole('link', { name: /BON-2026-0090/ })).toHaveAttribute('href', '/bons/b9');
    const seeAll = screen.getAllByRole('link', { name: /Voir tout/ }).map((a) => a.getAttribute('href'));
    expect(seeAll).toContain('/bons?subStatus=partial_restitution_to_sign');
  });

  it('affiche un message rassurant quand rien ne reste à traiter', async () => {
    const empty = todayFixture();
    mockApi({
      ...empty,
      toDo: {
        drafts: { total: 0, rows: [] }, overdueSignatures: { total: 0, rows: [] }, expiredLinks: { total: 0, rows: [] },
        overdueReturns: { total: 0, rows: [] }, contestations: { total: 0, rows: [] }, departures: { total: 0, rows: [] },
        partialRestitutionsToSign: { total: 0, rows: [] },
      },
    });
    renderWithProviders(<TodayTab />);
    expect(await screen.findByText("Rien à traiter aujourd'hui")).toBeInTheDocument();
  });

  it('« Bons ouverts par filiale » : chaque ligne ouvre les bons ouverts de la filiale', async () => {
    mockApi();
    const { user } = renderWithProviders(<TodayTab />);
    await user.click(await screen.findByText('Bâtir Nord'));
    expect(navigateMock).toHaveBeenCalledWith('/bons?excludeStatus=cancelled,archived&filialeId=f1');
  });

  it("montre une erreur avec « Réessayer » si l'accueil ne se charge pas", async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path.startsWith('/kpi/aujourdhui') ? Promise.reject(new Error('boom')) : Promise.resolve([]));
    renderWithProviders(<TodayTab />);
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
