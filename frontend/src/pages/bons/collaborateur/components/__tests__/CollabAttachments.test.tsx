import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { BonStatus } from '@/contracts/common';
import { CollabAttachments, collaboratorAttachmentStage } from '../CollabAttachments';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  const { listViaGet } = await import('@/test/api-mock');
  const get = vi.fn();
  return { ...actual, api: { get, getList: listViaGet(get), postForm: vi.fn(), getBlob: vi.fn() } };
});
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { api } from '@/lib/api';

const PHOTO = {
  id: 'a1',
  stage: 'mise_disposition',
  filename: 'rayure-ecran.jpg',
  mimeType: 'image/jpeg',
  size: 2048,
  label: null,
  uploadedByEmail: 'lea@livio.fr',
  createdAt: '2026-09-20T09:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue([PHOTO]);
});

describe('collaboratorAttachmentStage — l’étape se déduit du bon, jamais demandée', () => {
  it.each<[BonStatus, string | null]>([
    ['sent_mise_dispo', 'mise_disposition'],
    ['sent_restitution', 'restitution'],
    ['partially_returned', 'restitution'],
    ['active', null],
    ['contested', null],
    ['archived', null],
    ['cancelled', null],
    ['draft', null],
  ])('%s → %s', (status, stage) => {
    expect(collaboratorAttachmentStage(status)).toBe(stage);
  });
});

describe('CollabAttachments (R-093)', () => {
  it('bon clôturé : les pièces jointes se consultent, rien ne s’ajoute', async () => {
    renderWithProviders(<CollabAttachments bonId="b1" status="archived" />);

    expect(await screen.findByText('rayure-ecran.jpg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('aucune pièce jointe sur un bon sans ajout possible : la section ne s’affiche pas', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const { container } = renderWithProviders(<CollabAttachments bonId="b1" status="active" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('restitution à signer : un seul bouton pleine largeur, sans choix d’étape, qui envoie à l’étape « restitution »', async () => {
    vi.mocked(api.postForm).mockResolvedValue({});
    const { user } = renderWithProviders(<CollabAttachments bonId="b1" status="sent_restitution" />);

    const add = await screen.findByRole('button', { name: 'Ajouter une photo ou un PDF' });
    expect(add.className).toMatch(/min-h-11/);
    expect(add.className).toMatch(/w-full/);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    const input = screen.getByLabelText('Fichier à joindre') as HTMLInputElement;
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,application/pdf');
    await user.upload(input, new File(['x'], 'sacoche.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(api.postForm).toHaveBeenCalledTimes(1));
    const [path, form] = vi.mocked(api.postForm).mock.calls[0] as [string, FormData];
    expect(path).toBe('/bons/b1/attachments');
    expect(form.get('stage')).toBe('restitution');
    expect((form.get('file') as File).name).toBe('sacoche.jpg');
  });

  it('refuse un fichier de plus de 10 Mo sans l’envoyer', async () => {
    const { user } = renderWithProviders(<CollabAttachments bonId="b1" status="sent_mise_dispo" />);
    const input = (await screen.findByLabelText('Fichier à joindre')) as HTMLInputElement;
    const big = new File(['x'], 'enorme.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(input, big);
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it('ouvre une pièce jointe dans le navigateur', async () => {
    const tab = { opener: {}, location: { href: '' }, addEventListener: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.mocked(api.getBlob).mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' }));
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    const { user } = renderWithProviders(<CollabAttachments bonId="b1" status="archived" />);

    await user.click(await screen.findByRole('button', { name: /Ouvrir rayure-ecran\.jpg/ }));

    expect(api.getBlob).toHaveBeenCalledWith('/bons/b1/attachments/a1');
    await waitFor(() => expect(tab.location.href).toBe('blob:photo'));
    URL.createObjectURL = originalCreate;
    open.mockRestore();
  });
});
