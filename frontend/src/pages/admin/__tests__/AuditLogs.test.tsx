import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AuditLogsPage } from '../AuditLogs';

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

const log = {
  id: 'l1',
  action: 'bon_created',
  userEmail: 'jean@example.com',
  createdAt: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.startsWith('/audit/actions')) return Promise.resolve(['bon_created']);
    if (path.startsWith('/audit')) return Promise.resolve({ logs: [log], total: 1, page: 1, limit: 50 });
    return Promise.resolve(null);
  });
});

describe('AuditLogsPage', () => {
  it('affiche le journal avec les entrées chargées', async () => {
    renderWithProviders(<AuditLogsPage />);

    expect(await screen.findByText('Bon créé')).toBeInTheDocument();
    expect(screen.getByText('jean@example.com')).toBeInTheDocument();
    expect(screen.getByText('(1 entrée)')).toBeInTheDocument();
  });

  it("prévient que l'export sera tronqué quand les filtres dépassent le plafond", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/audit/actions')) return Promise.resolve([]);
      if (path.startsWith('/audit')) {
        return Promise.resolve({
          logs: [log], total: 12000, page: 1, limit: 50, exportLimit: 10000, exportTruncated: true,
        });
      }
      return Promise.resolve(null);
    });
    renderWithProviders(<AuditLogsPage />);

    expect(await screen.findByText(/export CSV est limité aux/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter CSV/ })).toBeEnabled();
  });

  it("n'affiche pas l'avertissement quand l'export est complet", async () => {
    renderWithProviders(<AuditLogsPage />);
    await screen.findByText('Bon créé');
    expect(screen.queryByText(/export CSV est limité/)).not.toBeInTheDocument();
  });
});
