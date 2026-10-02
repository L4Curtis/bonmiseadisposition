import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { PAGE_SIZE_STORAGE_KEY } from '@/hooks/usePagination';
import { AuditLogsPage } from '../AuditLogs';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { get: vi.fn(), getList: vi.fn(), getFile: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});
vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));

import { api } from '@/lib/api';

const configChange = {
  id: 'l1', bonId: null, userId: 'u1', userEmail: null, action: 'config_updated',
  details: { category: 'smtp', section: 'Email / SMTP', summary: 'Serveur SMTP : « a » → « b »', changes: [] },
  ipAddress: '10.0.0.1', userAgent: 'Firefox', createdAt: '2026-09-24T12:00:00.000Z', bon: null,
  user: { id: 'u1', displayName: 'Marie Martin', email: 'marie@livio.fr' },
};
const exportEntry = { ...configChange, id: 'l2', action: 'audit_exported', details: { rowCount: 571, truncated: false } };

function listOf(items: unknown[], meta = { exportLimit: 10000, exportTruncated: false }, total = items.length) {
  return { items, total, page: 1, limit: 25, truncated: false, meta };
}

/** Affiche l'adresse courante pour vérifier ce que l'écran y écrit. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(route = '/admin/audit') {
  return renderWithProviders(<><AuditLogsPage /><LocationProbe /></>, { route });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(api.getList).mockResolvedValue(listOf([configChange, exportEntry]));
});

describe('AuditLogsPage', () => {
  it('raconte chaque entrée par la phrase du catalogue, sans clé technique', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: "Journal d'audit" });
    expect(within(table).getByText('Marie Martin a modifié les paramètres « Email / SMTP » : Serveur SMTP : « a » → « b ».')).toBeInTheDocument();
    expect(within(table).getByText("Marie Martin a exporté le journal d'audit (lignes : 571).")).toBeInTheDocument();
    expect(within(table).getByText('Paramètres modifiés')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/rowCount|truncated|10\.0\.0\.1/);
  });

  it('relit les filtres dans l’adresse et les envoie au serveur', async () => {
    renderPage('/admin/audit?user=marie&domain=config&action=config_updated&dateFrom=2026-09-01&page=2');

    await waitFor(() => expect(api.getList).toHaveBeenCalled());
    expect(vi.mocked(api.getList).mock.calls[0][0]).toBe(
      '/audit?user=marie&domain=config&action=config_updated&dateFrom=2026-09-01&page=2&limit=25',
    );
    expect(screen.getByLabelText("Auteur de l'action (nom ou email)")).toHaveValue('marie');
  });

  it('écrit un filtre dans l’adresse et revient à la première page', async () => {
    const { user } = renderPage('/admin/audit?page=3');
    await screen.findByRole('table', { name: "Journal d'audit" });

    await user.type(screen.getByLabelText("Auteur de l'action (nom ou email)"), 'jean{Enter}');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?user=jean'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=');
  });

  it('annonce ce qui sera exporté puis exporte avec les mêmes filtres', async () => {
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['x']), filename: 'journal.csv', truncated: false });
    const { user } = renderPage('/admin/audit?action=config_updated');
    await screen.findByRole('table', { name: "Journal d'audit" });

    await user.click(screen.getByRole('button', { name: /Exporter CSV/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('2 actions')).toBeInTheDocument();
    expect(within(dialog).getByText(/Action : Paramètres modifiés/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Exporter/ }));

    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith('/audit/export?action=config_updated'));
  });

  it('prévient avant l’export qu’il sera tronqué, et après qu’il l’a été', async () => {
    vi.mocked(api.getList).mockResolvedValue(listOf([configChange], { exportLimit: 10000, exportTruncated: true }, 12000));
    vi.mocked(api.getFile).mockResolvedValue({ blob: new Blob(['x']), filename: 'journal.csv', truncated: true });
    const { user } = renderPage();
    await screen.findByRole('table', { name: "Journal d'audit" });

    await user.click(screen.getByRole('button', { name: /Exporter CSV/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/10\s000/);
    await user.click(within(dialog).getByRole('button', { name: /Exporter/ }));

    expect(await screen.findByText('Export incomplet')).toBeInTheDocument();
  });

  it('pagine comme les autres listes : « 1–25 sur 608 entrées », 25 lignes par défaut', async () => {
    vi.mocked(api.getList).mockResolvedValue(listOf([configChange], undefined, 608));
    renderPage();

    const nav = await screen.findByRole('navigation', { name: 'Pagination' });
    expect(within(nav).getByText('1–25 sur 608 entrées')).toBeInTheDocument();
    expect(within(nav).getByText('Page 1 sur 25')).toBeInTheDocument();
    expect(vi.mocked(api.getList).mock.calls[0][0]).toBe('/audit?page=1&limit=25');
  });

  it('reprend le nombre de lignes choisi sur les autres listes', async () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '100');
    vi.mocked(api.getList).mockResolvedValue(listOf([configChange], undefined, 608));
    renderPage();

    await waitFor(() => expect(api.getList).toHaveBeenCalledWith('/audit?page=1&limit=100'));
  });

  it('change le nombre de lignes, le mémorise et revient à la première page', async () => {
    vi.mocked(api.getList).mockResolvedValue(listOf([configChange], undefined, 608));
    const { user } = renderPage('/admin/audit?domain=config&page=3');
    await screen.findByRole('navigation', { name: 'Pagination' });

    await user.selectOptions(screen.getByLabelText('Lignes par page'), '50');

    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith('/audit?domain=config&page=1&limit=50'));
    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe('50');
    expect(screen.getByTestId('location')).toHaveTextContent('?domain=config');
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=');
  });

  it('écrit la page suivante dans l’adresse', async () => {
    vi.mocked(api.getList).mockResolvedValue(listOf([configChange], undefined, 608));
    const { user } = renderPage();
    await screen.findByRole('navigation', { name: 'Pagination' });

    await user.click(screen.getByRole('button', { name: 'Page suivante' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?page=2'));
    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith('/audit?page=2&limit=25'));
  });

  it('signale une erreur de chargement', async () => {
    vi.mocked(api.getList).mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
