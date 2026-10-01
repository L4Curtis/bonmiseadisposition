import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BonPdfSnapshots } from '../BonPdfSnapshots';

describe('BonPdfSnapshots — PV prêt (S18)', () => {
  it('le PV certifié par la signature IT se télécharge avant son départ, avec son signataire', async () => {
    const onDownloadReadyPv = vi.fn();
    render(
      <BonPdfSnapshots
        snapshots={[]}
        pdfLoading={null}
        onDownloadSnapshot={vi.fn()}
        readyPv={{ signedAt: '2026-06-19T21:53:00.000Z', signerName: 'Julie Moreau' }}
        onDownloadReadyPv={onDownloadReadyPv}
      />,
    );
    expect(screen.getByText('Documents PDF (1)', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('PV de non-restitution — signature IT')).toBeInTheDocument();
    expect(screen.getByText(/Prêt, signé par Julie Moreau/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Télécharger PV de non-restitution — signature IT/ }));
    expect(onDownloadReadyPv).toHaveBeenCalledTimes(1);
  });

  it('documents manquants : nommés au vocabulaire de la fiche', () => {
    render(<BonPdfSnapshots snapshots={[]} pdfLoading={null} onDownloadSnapshot={vi.fn()} missing={['signature_it_mise_disposition']} />);
    expect(screen.getByText(/Document\(s\) manquant\(s\) : Remise — signature IT/)).toBeInTheDocument();
  });
});
