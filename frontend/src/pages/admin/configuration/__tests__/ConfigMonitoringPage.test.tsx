import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ConfigMonitoringPage } from '../ConfigMonitoringPage';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { get: vi.fn(), getList: vi.fn(), post: vi.fn() } };
});
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock('../ScheduledJobsCard', () => ({ ScheduledJobsCard: () => null }));
vi.mock('@/components/admin/FailedEmailsCard', () => ({ FailedEmailsCard: () => null }));

import { api } from '@/lib/api';

const FAILED_EXPORT = {
  id: '00000000-0000-4000-8000-000000000001',
  bonId: '00000000-0000-4000-8000-000000000002',
  filename: 'BON-2026-0001_mise_disposition.pdf',
  errorMessage: 'Partage non monté',
  retryCount: 1,
  lastAttemptAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  bonReference: 'BON-2026-0001',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ enabled: true, total: 3, success: 2, failed: 1, pending: 0, lastSuccessAt: null });
  vi.mocked(api.getList).mockResolvedValue({ items: [FAILED_EXPORT], total: 1, page: 1, limit: 1, truncated: false } as never);
});

describe('ConfigMonitoringPage', () => {
  it('annonce l’échec d’une relance avec sa cause, au lieu de « relancé »', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: false, message: 'La relance a échoué : partage non monté' });
    renderWithProviders(<ConfigMonitoringPage />);

    const [retry] = await screen.findAllByRole('button', { name: `Relancer la copie de ${FAILED_EXPORT.filename}` });
    fireEvent.click(retry);

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      title: 'La relance a échoué',
      description: 'La relance a échoué : partage non monté',
      variant: 'destructive',
    }));
  });

  it('annonce une relance réussie', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true, message: 'Export relancé : le PDF a été copié sur le partage.' });
    renderWithProviders(<ConfigMonitoringPage />);

    const [retry] = await screen.findAllByRole('button', { name: `Relancer la copie de ${FAILED_EXPORT.filename}` });
    fireEvent.click(retry);

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Copie relancée', variant: 'success' })));
  });
});
