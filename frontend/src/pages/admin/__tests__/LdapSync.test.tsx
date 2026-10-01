import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { LdapSyncStatusResponse } from '@/contracts/admin';
import { LdapSyncPage } from '../LdapSync';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

import { api } from '@/lib/api';

const FAILED: LdapSyncStatusResponse = {
  lastSync: '2026-10-01T08:00:00.000Z',
  lastSyncSuccess: false,
  lastSyncCount: null,
  lastSyncError: 'Serveur LDAP injoignable : vérifiez l’adresse.',
  lastSyncSkipped: null,
  lastSyncAborted: false,
  lastSyncWarning: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue(FAILED);
  vi.mocked(api.getList).mockResolvedValue({ items: [], total: 0, page: 1, limit: 0, truncated: false } as never);
});

describe('LdapSyncPage', () => {
  it('affiche l’échec de la dernière synchronisation avec son message', async () => {
    renderWithProviders(<LdapSyncPage />);

    expect(await screen.findByText('Échec')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Serveur LDAP injoignable');
  });

  it('désactive les comptes de l’annuaire par la nouvelle route et annonce ce que le serveur renvoie', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true, message: "2 comptes de l'annuaire désactivés.", deactivated: 2 });
    renderWithProviders(<LdapSyncPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver les comptes de l’annuaire' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ldap/deactivate-all'));
    expect(api.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "2 comptes de l'annuaire désactivés.", variant: 'success' }));
  });
});
