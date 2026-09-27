import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { InPersonModal } from '../InPersonModal';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));

import QRCode from 'qrcode';

describe('InPersonModal', () => {
  it('génère le QR code en haute définition avec la marge normalisée de 4 modules', async () => {
    renderWithProviders(<InPersonModal type="mise_disposition" token="tok-1" onClose={vi.fn()} />);

    await screen.findByAltText('QR code pour signer la remise');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      expect.stringContaining('/signer/tok-1'),
      expect.objectContaining({ width: 1024, margin: 4 }),
    );
  });

  it('PV de non-restitution signable sur place : le titre le nomme', async () => {
    renderWithProviders(<InPersonModal type="pv_cloture" token="tok-3" onClose={vi.fn()} />);
    expect(await screen.findByAltText('QR code pour signer le PV de non-restitution')).toBeInTheDocument();
  });

  it('affiche le QR code en grand puis revient à la modale sans la fermer', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<InPersonModal type="restitution" token="tok-2" onClose={onClose} />);

    const agrandir = screen.getByRole('button', { name: /afficher en grand/i });
    await waitFor(() => expect(agrandir).not.toBeDisabled());
    await user.click(agrandir);

    expect(await screen.findByRole('dialog', { name: 'Scannez pour signer la restitution' })).toBeInTheDocument();
    expect(screen.getByAltText('QR code pour signer la restitution, en grand')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réduire' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Scannez pour signer la restitution' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Signature au guichet' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
