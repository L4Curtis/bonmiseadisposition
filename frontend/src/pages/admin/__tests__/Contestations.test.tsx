import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ContestationsPage } from '../Contestations';

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
import type { ContestationListItem, ContestationListResponse } from '@/contracts/contestations';

function contestation(extra: Partial<ContestationListItem> = {}): ContestationListItem {
  return {
    id: 'c1',
    bonId: 'b1',
    userId: 'u1',
    message: 'Écran cassé à réception',
    status: 'open',
    previousBonStatus: 'active',
    contestedDocument: 'mise_disposition',
    outcome: null,
    reviewedById: null,
    reviewedAt: null,
    resolvedById: null,
    resolvedAt: null,
    resolutionMessage: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    user: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@example.com' },
    reviewedBy: null,
    resolvedBy: null,
    bon: { id: 'b1', reference: 'BMD-2026-0001', status: 'contested', filiale: { displayName: 'Paris' } },
    ...extra,
  };
}

function response(overrides: Partial<ContestationListResponse> = {}): ContestationListResponse {
  return {
    contestations: [
      contestation(),
      contestation({ id: 'c2', createdAt: '2026-09-20T10:00:00.000Z', user: { id: 'u2', displayName: 'Léa Martin', email: null } }),
    ],
    total: 2,
    page: 1,
    limit: 20,
    openCount: 2,
    pendingCount: 2,
    overdueCount: 1,
    overdueAfterDays: 7,
    // Seuil calculé par le serveur (7 jours ouvrés avant maintenant).
    overdueSince: '2026-09-10T07:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue(response());
});

describe('ContestationsPage', () => {
  it('liste « À traiter » par défaut, avec les compteurs de l’en-tête en jours ouvrés', async () => {
    renderWithProviders(<ContestationsPage />);

    expect(await screen.findByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getAllByText('BMD-2026-0001').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 à traiter/)).toBeInTheDocument();
    expect(screen.getByText(/1 en attente depuis plus de 7 jours ouvrés/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('aTraiter=1'));
  });

  it('« en retard » suit le seuil du serveur, pas le nombre de jours de calendrier', async () => {
    renderWithProviders(<ContestationsPage />);
    await screen.findByText('Jean Dupont');
    // Seule la contestation reçue avant `overdueSince` est signalée en retard.
    expect(screen.getAllByText(/en retard/)).toHaveLength(1);
  });
});
