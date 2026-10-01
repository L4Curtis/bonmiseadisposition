import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BonHistoryEntry } from '@/contracts/bons';
import { BonHistory, HISTORY_COLLAPSED_COUNT } from '../BonHistory';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  const { listViaGet } = await import('@/test/api-mock');
  const get = vi.fn();
  return { ...actual, api: { get, getList: listViaGet(get) } };
});

import { api } from '@/lib/api';
import { listOf } from '@/test/api-mock';

function entry(n: number, extra: Partial<BonHistoryEntry> = {}): BonHistoryEntry {
  return {
    id: `a${n}`,
    at: `2026-09-${String(n).padStart(2, '0')}T08:00:00.000Z`,
    action: 'bon_sent',
    label: 'Bon envoyé',
    tone: 'action',
    sentence: `Action numéro ${n}.`,
    actorName: 'Thomas Girard',
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('BonHistory — bloc « Historique » de la fiche IT', () => {
  it('raconte chaque action (phrase, date, libellé) dans l’ordre des événements', async () => {
    vi.mocked(api.get).mockResolvedValue(listOf([
      entry(1, { sentence: 'Julie Moreau a créé le bon BON-2026-0042.', label: 'Bon créé' }),
      entry(2, { sentence: 'Thomas Girard a annulé le bon BON-2026-0042 (motif : Doublon).', label: 'Bon annulé', tone: 'failure' }),
    ]));
    render(<BonHistory bonId="b1" refreshKey="k1" />);

    expect(await screen.findByText('Julie Moreau a créé le bon BON-2026-0042.')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('créé');
    expect(items[1]).toHaveTextContent('annulé');
    expect(items[1]).toHaveTextContent('02/09/2026');
    expect(items[1]).toHaveTextContent('Bon annulé');
    expect(api.get).toHaveBeenCalledWith('/bons/b1/history');
  });

  it('historique long : les dernières actions d’abord, les précédentes à la demande', async () => {
    const total = HISTORY_COLLAPSED_COUNT + 3;
    vi.mocked(api.get).mockResolvedValue(listOf(Array.from({ length: total }, (_, i) => entry(i + 1))));
    render(<BonHistory bonId="b1" refreshKey="k1" />);

    await screen.findByText(`Action numéro ${total}.`);
    expect(screen.queryByText('Action numéro 1.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 3 actions précédentes' }));
    expect(screen.getByText('Action numéro 1.')).toBeInTheDocument();
  });

  it('plafond du serveur atteint : le bloc dit combien d’actions sont montrées sur combien', async () => {
    const shown = Array.from({ length: 3 }, (_, i) => entry(i + 1));
    vi.mocked(api.get).mockResolvedValue({ ...listOf(shown), total: 230, limit: 200, truncated: true });
    render(<BonHistory bonId="b1" refreshKey="k1" />);
    expect(await screen.findByText(/Seules les 3 dernières actions sur 230 sont affichées\./)).toBeInTheDocument();
  });

  it('aucune action, ou historique indisponible : un message, jamais un bloc vide', async () => {
    vi.mocked(api.get).mockResolvedValue(listOf([]));
    const { unmount } = render(<BonHistory bonId="b1" refreshKey="k1" />);
    expect(await screen.findByText('Aucune action enregistrée pour ce bon.')).toBeInTheDocument();
    unmount();

    vi.mocked(api.get).mockRejectedValue(new Error('Erreur interne du serveur.'));
    render(<BonHistory bonId="b1" refreshKey="k1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur interne du serveur.');
  });

  it('relit l’historique après une action sur le bon (clé de rafraîchissement)', async () => {
    vi.mocked(api.get).mockResolvedValue(listOf([entry(1)]));
    const { rerender } = render(<BonHistory bonId="b1" refreshKey="k1" />);
    await screen.findByText('Action numéro 1.');
    vi.mocked(api.get).mockResolvedValue(listOf([entry(1), entry(2)]));
    rerender(<BonHistory bonId="b1" refreshKey="k2" />);
    expect(await screen.findByText('Action numéro 2.')).toBeInTheDocument();
  });
});
