import { describe, it, expect, vi, beforeEach } from 'vitest';

// Rendu complet de la page de création (catalogue, autocomplétion) : sous la
// charge de la suite parallèle, le délai par défaut de 5 s est parfois dépassé.
vi.setConfig({ testTimeout: 20000 });
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { CatalogSearch, UserAutocomplete, BonCreatePage } from '../BonCreate';

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

// Régression F1-1 : un <button> sans type="button" dans un <form> est un
// submit button implicite — cliquer un résultat de recherche (catalogue ou
// collaborateur) soumettait le formulaire et créait le bon avant la saisie
// des numéros de série. Voir BonCreate.tsx (UserAutocomplete / CatalogSearch).

describe('CatalogSearch — ne doit jamais soumettre le formulaire englobant', () => {
  it('cliquer un résultat catalogue ajoute l\'article sans déclencher onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onAdd = vi.fn();
    const items = [{ id: '1', brand: 'Dell', model: 'Latitude 5420', category: 'laptop', active: true }];

    render(
      <form onSubmit={onSubmit}>
        <CatalogSearch allItems={items} onAdd={onAdd} />
      </form>,
    );

    await user.click(screen.getByPlaceholderText('Ajouter depuis le catalogue...'));
    await user.type(screen.getByPlaceholderText('Ajouter depuis le catalogue...'), 'Dell');

    const result = await screen.findByText('Dell Latitude 5420');
    await user.click(result);

    expect(onAdd).toHaveBeenCalledWith(items[0]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('effacer la recherche catalogue ne soumet pas le formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const items = [{ id: '1', brand: 'Dell', model: 'Latitude 5420', category: 'laptop', active: true }];

    render(
      <form onSubmit={onSubmit}>
        <CatalogSearch allItems={items} onAdd={vi.fn()} />
      </form>,
    );

    const input = screen.getByPlaceholderText('Ajouter depuis le catalogue...');
    await user.type(input, 'Dell');
    const clearBtn = screen.getByLabelText('Effacer la recherche catalogue');
    await user.click(clearBtn);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('UserAutocomplete — ne doit jamais soumettre le formulaire englobant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cliquer un résultat collaborateur le sélectionne sans déclencher onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onChange = vi.fn();

    vi.mocked(api.get).mockResolvedValue([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' }]);

    render(
      <form onSubmit={onSubmit}>
        <UserAutocomplete value={null} onChange={onChange} />
      </form>,
    );

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');

    const result = await waitFor(() => screen.getByText('Jean Dupont'), { timeout: 2000 });
    await user.click(result);

    expect(onChange).toHaveBeenCalledWith({ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('retirer le collaborateur sélectionné ne soumet pas le formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onChange = vi.fn();
    const selected = { id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' };

    render(
      <form onSubmit={onSubmit}>
        <UserAutocomplete value={selected} onChange={onChange} />
      </form>,
    );

    await user.click(screen.getByLabelText('Retirer le collaborateur sélectionné'));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('BonCreatePage — validation avant envoi', () => {
  const filiale = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([filiale]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        return Promise.resolve([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' }]);
      }
      if (path.startsWith('/equipment/serial-conflicts')) return Promise.resolve([]);
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  it('rejette deux équipements avec le même numéro de série sans jamais appeler POST /bons', async () => {
    // pointerEventsCheck: 0 — le <Select> Radix bascule brièvement
    // `pointer-events` sur <body> pendant l'animation d'ouverture/fermeture ;
    // en jsdom cette transition n'est pas garantie terminée entre deux
    // interactions, ce qui fait échouer par erreur l'assertion stricte de
    // user-event ("pointer-events: none"). Cf. discussions connues
    // testing-library/user-event + Radix UI en environnement jsdom.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = renderWithProviders(<BonCreatePage />);

    // Collaborateur (nécessaire pour que l'erreur de doublon soit celle qui
    // remonte en premier — sinon "Sélectionnez un collaborateur" primerait).
    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');
    await user.click(await screen.findByText('Jean Dupont'));

    // Filiale — le <select> natif caché (miroir accessible de Radix Select)
    // porte aussi une <option>Siège</option> : cibler `role="option"` pour ne
    // matcher que l'item du listbox ouvert (le natif est aria-hidden).
    await user.click(screen.getByText('Sélectionner une filiale...'));
    await user.click(await screen.findByRole('option', { name: 'Siège' }));

    // Date de mise à disposition (pas de <label htmlFor> associé dans le
    // markup — on cible directement le premier input[type=date]).
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } });

    // Deuxième ligne d'équipement, puis même numéro de série sur les deux
    await user.click(screen.getByRole('button', { name: /ligne vide/i }));
    const labels = screen.getAllByPlaceholderText('Libellé personnalisé');
    await user.type(labels[0], 'Laptop A');
    await user.type(labels[1], 'Laptop B');
    const serials = screen.getAllByPlaceholderText('SN-XXXXX');
    await user.type(serials[0], 'SN-123');
    await user.type(serials[1], 'SN-123');

    await user.click(screen.getByRole('button', { name: /créer le bon/i }));

    expect(await screen.findByText(/Numéro de série en double/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuse la soumission sans collaborateur sélectionné, sans jamais appeler POST /bons', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<BonCreatePage />);

    // La date de mise à disposition porte l'attribut HTML `required` : sans
    // valeur, le navigateur (et jsdom) bloque nativement la soumission avant
    // même que React ne voie l'événement submit — aucun message Zod ne
    // s'affiche alors, pas parce que la validation collaborateur est absente,
    // mais parce qu'on n'atteint jamais handleSubmit. On la renseigne donc
    // pour isoler précisément le message qui nous intéresse ici.
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } });

    // Aucun collaborateur choisi : la validation doit s'arrêter là, avant
    // même de considérer les équipements ou la vérification de doublons de
    // numéro de série (le panneau « Créer quand même » — qui ne peut
    // apparaître qu'après une validation réussie — n'est donc jamais atteint
    // sans collaborateur ; voir la limite notée dans le rapport final).
    await user.click(await screen.findByRole('button', { name: /créer le bon/i }));

    expect(await screen.findByText('Sélectionnez un collaborateur')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
