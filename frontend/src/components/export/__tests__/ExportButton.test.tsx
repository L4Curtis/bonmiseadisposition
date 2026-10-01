import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { ...actual.api, getFile: vi.fn() } };
});
vi.mock('@/lib/download', () => ({ saveBlob: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api, ApiError, type DownloadedFile } from '@/lib/api';
import { saveBlob } from '@/lib/download';
import { toast } from '@/hooks/use-toast';
import { ExportButton, type ExportButtonProps } from '../ExportButton';

const ITEMS = { singular: 'équipement', plural: 'équipements' };
const FILTERS = [{ label: 'Filiale', value: 'Paris' }];

function file(overrides: Partial<DownloadedFile> = {}): DownloadedFile {
  return { blob: new Blob(['a;b']), filename: 'inventaire-2026-10-01.csv', truncated: false, ...overrides };
}

function setup(props: Partial<ExportButtonProps> = {}) {
  const user = userEvent.setup();
  render(
    <ExportButton
      path="/reporting/inventory/export?filialeId=f1"
      fallbackFilename="inventaire.csv"
      filters={FILTERS}
      itemLabel={ITEMS}
      {...props}
    />,
  );
  return user;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, name = 'Exporter CSV') {
  await user.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.mocked(api.getFile).mockReset();
  vi.mocked(saveBlob).mockReset();
  vi.mocked(toast).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportButton — avant l’export', () => {
  it('annonce le nombre de lignes et les filtres, sans rien télécharger', async () => {
    const user = setup({ count: 42, limit: 10000 });
    const dialog = await openDialog(user);

    expect(dialog).toHaveTextContent('42 équipements à exporter.');
    expect(dialog).toHaveTextContent('Filtres : Filiale : Paris');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.getFile).not.toHaveBeenCalled();
  });

  it('au-delà du plafond, prévient que le fichier sera coupé', async () => {
    const user = setup({ count: 12, limit: 10 });
    await openDialog(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('ne contiendra que les 10 premières');
    expect(screen.getByRole('button', { name: /Exporter les 10 premières lignes/ })).toBeEnabled();
  });

  it('lit le nombre à l’ouverture quand l’écran ne le connaît pas', async () => {
    const loadCount = vi.fn().mockResolvedValue(7);
    const user = setup({ loadCount });
    await openDialog(user);

    expect(await screen.findByText(/7 équipements/)).toBeInTheDocument();
    expect(loadCount).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('un comptage en échec est dit, sans empêcher l’export', async () => {
    const user = setup({ loadCount: () => Promise.reject(new ApiError(500, 'Erreur')) });
    await openDialog(user);

    expect(await screen.findByText(/Nombre de lignes inconnu/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Exporter$/ })).toBeEnabled();
  });

  it('aucune ligne : rien à exporter', async () => {
    const user = setup({ count: 0 });
    await openDialog(user);

    expect(await screen.findByText(/rien à exporter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Exporter$/ })).toBeDisabled();
  });

  it('export d’indicateurs : les filtres seulement, pas de nombre de lignes', async () => {
    const user = setup({
      uncounted: true,
      label: 'Exporter ces indicateurs',
      filters: [{ label: 'Période', value: 'du 01/09/2026 au 30/09/2026' }],
    });
    const dialog = await openDialog(user, 'Exporter ces indicateurs');

    expect(dialog).toHaveTextContent('Filtres : Période : du 01/09/2026 au 30/09/2026');
    expect(dialog).not.toHaveTextContent('à exporter');
  });
});

describe('ExportButton — après l’export', () => {
  it('télécharge sous le nom du serveur et confirme par une notification', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file());
    const user = setup({ count: 3 });
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: /^Exporter$/ }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'inventaire-2026-10-01.csv'));
    expect(api.getFile).toHaveBeenCalledWith('/reporting/inventory/export?filialeId=f1');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export réussi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fichier coupé (X-Truncated) : bandeau gardé jusqu’à ce qu’on le ferme', async () => {
    vi.mocked(api.getFile).mockResolvedValue(file({ truncated: true }));
    const user = setup({ count: 12, limit: 10 });
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: /Exporter les 10 premières lignes/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Export incomplet');
    expect(banner).toHaveTextContent('les 10 premières lignes sur 12');
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Export réussi' }));

    await user.click(screen.getByRole('button', { name: 'Fermer l’avertissement' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('une erreur du serveur est affichée, la confirmation reste ouverte', async () => {
    vi.mocked(api.getFile).mockRejectedValue(new ApiError(403, 'Accès refusé'));
    const user = setup({ count: 3 });
    await openDialog(user);
    await user.click(screen.getByRole('button', { name: /^Exporter$/ }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Accès refusé', variant: 'destructive' }),
    ));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
