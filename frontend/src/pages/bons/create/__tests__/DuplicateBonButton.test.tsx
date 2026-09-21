import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DuplicateBonButton } from '../DuplicateBonButton';

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

beforeEach(() => {
  vi.resetAllMocks();
});

// Régression F1-1 (voir BonCreate.test.tsx) : le bouton déclencheur ne doit
// jamais soumettre le formulaire englobant.
describe('DuplicateBonButton — C3, repartir d\'un bon existant', () => {
  it('le bouton déclencheur ne soumet pas le formulaire englobant', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <DuplicateBonButton onImport={vi.fn()} />
      </form>,
    );

    await user.click(screen.getByRole('button', { name: /repartir d'un bon existant/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('Rechercher un bon à dupliquer')).toBeInTheDocument();
  });

  it('recherche et affiche les bons correspondants, puis importe uniquement les équipements du bon choisi', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    vi.mocked(api.get).mockResolvedValue({
      bons: [
        {
          id: 'b1',
          reference: 'BON-2026-0010',
          dateMiseDisposition: '2026-01-15',
          collaborateur: { displayName: 'Jean Dupont' },
          equipments: [
            { catalogItem: { id: 'c1', brand: 'Dell', model: 'Latitude 5420' }, customLabel: null },
            { catalogItem: null, customLabel: 'Casque audio' },
          ],
        },
      ],
    });

    render(<DuplicateBonButton onImport={onImport} />);
    await user.click(screen.getByRole('button', { name: /repartir d'un bon existant/i }));
    await user.type(screen.getByLabelText('Rechercher un bon à dupliquer'), 'Dupont');

    const result = await screen.findByText(/BON-2026-0010 — Jean Dupont/);
    await user.click(result);

    expect(onImport).toHaveBeenCalledTimes(1);
    const importedLines = onImport.mock.calls[0][0];
    expect(importedLines).toHaveLength(2);
    expect(importedLines[0]).toMatchObject({ catalogItemId: 'c1', catalogItemLabel: 'Dell Latitude 5420' });
    expect(importedLines[0].serialNumber).toBeUndefined();
    expect(importedLines[1]).toMatchObject({ customLabel: 'Casque audio' });

    // La boîte de dialogue se ferme après le choix
    await waitFor(() => expect(screen.queryByLabelText('Rechercher un bon à dupliquer')).not.toBeInTheDocument());
  });

  it('affiche "Aucun bon trouvé" quand la recherche ne renvoie rien', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ bons: [] });

    render(<DuplicateBonButton onImport={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /repartir d'un bon existant/i }));
    await user.type(screen.getByLabelText('Rechercher un bon à dupliquer'), 'Introuvable');

    expect(await screen.findByText('Aucun bon trouvé')).toBeInTheDocument();
  });

  it('affiche un message si la recherche échoue', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValue(new Error('boom'));

    render(<DuplicateBonButton onImport={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /repartir d'un bon existant/i }));
    await user.type(screen.getByLabelText('Rechercher un bon à dupliquer'), 'Dupont');

    expect(await screen.findByText('Recherche indisponible pour le moment.')).toBeInTheDocument();
  });
});
