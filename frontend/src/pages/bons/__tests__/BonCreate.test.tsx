import { describe, it, expect, vi, beforeEach } from 'vitest';

// Rendu complet de la page de création (catalogue, autocomplétion) : sous la
// charge de la suite parallèle, le délai par défaut de 5 s est parfois dépassé.
vi.setConfig({ testTimeout: 20000 });
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';
import { todayInParis } from '@/lib/kpi-period';
import { CatalogSearch, UserAutocomplete, BonCreatePage } from '../BonCreate';

const DRAFT_STORAGE_KEY = 'bon-create-draft:v1';

// Un brouillon laissé par un test précédent ne doit jamais fuiter vers le
// suivant (chaque test rend sa propre page, mais localStorage est partagé
// par tout le fichier — voir C5, lib/draftStorage).
beforeEach(() => {
  window.localStorage.clear();
});

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
    resetActiveFilialesForTests();
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
    resetActiveFilialesForTests();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([filiale]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        return Promise.resolve([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' }]);
      }
      // Forme RÉELLE de la réponse (enveloppe, pas un tableau) : un mock qui
      // renvoyait `[]` laissait passer un bug où l'avertissement de doublon
      // ne se déclenchait jamais (conflicts.length sur un objet = undefined).
      if (path.startsWith('/equipment/serial-conflicts')) return Promise.resolve({ items: [], truncated: false });
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

  // Régression : GET /equipment/serial-conflicts renvoie une ENVELOPPE
  // ({ items, truncated }), pas un tableau. Le formulaire lisait
  // `conflicts.length` sur cet objet — soit `undefined` — donc l'avertissement
  // ne s'est jamais affiché depuis l'ajout de l'enveloppe, sans la moindre
  // erreur. Le mock de ce fichier renvoyait lui aussi un tableau, ce qui a
  // masqué le défaut : il suit désormais la forme réelle de l'API.
  it("affiche l'avertissement quand un numéro de série est déjà en circulation, sans appeler POST /bons", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([{ id: 'f1', name: 'Siège', displayName: 'Siège' }]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        return Promise.resolve([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' }]);
      }
      if (path.startsWith('/equipment/serial-conflicts')) {
        return Promise.resolve({
          items: [{
            serialNumber: 'SN-123',
            bonId: 'b-autre',
            bonReference: 'BON-2026-0042',
            bonStatus: 'active',
            collaborateur: 'Marie Martin',
          }],
          truncated: false,
        });
      }
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = renderWithProviders(<BonCreatePage />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');
    await user.click(await screen.findByText('Jean Dupont'));
    await user.click(screen.getByText('Sélectionner une filiale...'));
    await user.click(await screen.findByRole('option', { name: 'Siège' }));
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } });

    await user.type(screen.getAllByPlaceholderText('Libellé personnalisé')[0], 'Laptop A');
    await user.type(screen.getAllByPlaceholderText('SN-XXXXX')[0], 'SN-123');

    await user.click(screen.getByRole('button', { name: /créer le bon/i }));

    expect(await screen.findByText(/déjà en circulation sur un autre bon/i)).toBeInTheDocument();
    // Scopé à la liste du bandeau de soumission : depuis C6, la même référence
    // peut aussi apparaître dans l'avertissement de ligne (sortie de champ) —
    // les deux sont attendus simultanément, voir useLiveSerialConflicts.
    const conflictList = container.querySelector('ul.list-disc');
    expect(conflictList).toHaveTextContent('BON-2026-0042');
    expect(conflictList).toHaveTextContent('Marie Martin');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuse la soumission sans collaborateur sélectionné, sans jamais appeler POST /bons', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<BonCreatePage />);

    // La date de mise à disposition est pré-remplie à aujourd'hui dès
    // l'ouverture (C2) et porte l'attribut HTML `required` : elle n'est donc
    // plus la cause d'un blocage natif de soumission ici. On la fixe malgré
    // tout à une valeur stable pour isoler précisément le message qui nous
    // intéresse dans ce test (indépendant de la date du jour).
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

describe('BonCreatePage — pré-remplissage à l\'ouverture (C1, C2)', () => {
  const siege = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };
  const agenceLyon = { id: 'f2', name: 'agence-lyon', displayName: 'Agence Lyon', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveFilialesForTests();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([siege, agenceLyon]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        // Collaborateur d'annuaire dont la filiale est connue (voir /users/search).
        return Promise.resolve([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr', filialeId: 'f2' }]);
      }
      if (path.startsWith('/equipment/serial-conflicts')) return Promise.resolve({ items: [], truncated: false });
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  // C2 : la date de mise à disposition est pré-remplie à aujourd'hui côté
  // Paris (todayInParis), pas via toISOString() qui décale en soirée.
  it('C2 — la date de mise à disposition est pré-remplie à aujourd\'hui à l\'ouverture, en création', async () => {
    const { container } = renderWithProviders(<BonCreatePage />);
    // Laisse le chargement des données de référence (filiales/catalogue/packs)
    // se résoudre pour ne pas laisser de mise à jour d'état hors act().
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe(todayInParis());
  });

  // C2 : jamais en édition d'un bon existant — la date vient du brouillon serveur.
  it("C2 — n'écrase pas la date d'un brouillon existant en édition", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([siege, agenceLyon]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path === '/bons/existant') {
        return Promise.resolve({
          id: 'existant',
          reference: 'BON-2026-0001',
          status: 'draft',
          filialeId: 'f1',
          civilite: 'mr',
          dateMiseDisposition: '2020-05-01',
          collaborateur: { id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' },
          equipments: [],
        });
      }
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });

    const { container } = renderWithProviders(<BonCreatePage />, { route: '/bons/existant/edit', path: '/bons/:id/edit' });
    await waitFor(() => expect(screen.getByText('Modifier le brouillon BON-2026-0001')).toBeInTheDocument());
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2020-05-01');
  });

  it('C1 — choisir un collaborateur dans l\'autocomplétion pré-remplit sa filiale connue de l\'annuaire', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = renderWithProviders(<BonCreatePage />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');
    await user.click(await screen.findByText('Jean Dupont'));

    const filialeTrigger = container.querySelector('#filiale-select') as HTMLElement;
    await waitFor(() => expect(filialeTrigger).toHaveTextContent('Agence Lyon'));
  });

  it('C1 — ne recouvre jamais une filiale déjà choisie manuellement par l\'utilisateur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = renderWithProviders(<BonCreatePage />);
    const filialeTrigger = container.querySelector('#filiale-select') as HTMLElement;

    // Choix manuel d'abord (filiale différente de celle du collaborateur)
    await user.click(screen.getByText('Sélectionner une filiale...'));
    await user.click(await screen.findByRole('option', { name: 'Siège' }));
    expect(filialeTrigger).toHaveTextContent('Siège');

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');
    await user.click(await screen.findByText('Jean Dupont'));

    expect(filialeTrigger).toHaveTextContent('Siège');
    expect(filialeTrigger).not.toHaveTextContent('Agence Lyon');
  });

  it('C1 — un collaborateur sans filiale connue laisse la filiale du formulaire inchangée', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([siege, agenceLyon]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        return Promise.resolve([{ id: 'u2', displayName: 'Alice Martin', email: 'alice@livio.fr' }]);
      }
      if (path.startsWith('/equipment/serial-conflicts')) return Promise.resolve({ items: [], truncated: false });
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<BonCreatePage />);
    const filialeTrigger = container.querySelector('#filiale-select') as HTMLElement;

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Alice');
    await user.click(await screen.findByText('Alice Martin'));

    expect(filialeTrigger).toHaveTextContent('Sélectionner une filiale...');
  });
});

describe("BonCreatePage — repartir d'un bon existant via ?duplicateFrom (C3)", () => {
  const filiale = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveFilialesForTests();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([filiale]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path === '/bons/source-bon') {
        return Promise.resolve({
          id: 'source-bon',
          reference: 'BON-2026-0010',
          dateMiseDisposition: '2020-01-01',
          collaborateur: { id: 'u9', displayName: 'Ancien Titulaire', email: 'ancien@livio.fr' },
          equipments: [{ catalogItem: null, customLabel: 'Casque audio' }],
        });
      }
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  it('importe les équipements du bon indiqué, sans reprendre le collaborateur ni les dates', async () => {
    renderWithProviders(<BonCreatePage />, {
      route: '/bons/new?duplicateFrom=source-bon',
      path: '/bons/new',
    });

    expect(await screen.findByDisplayValue('Casque audio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rechercher un collaborateur...')).toBeInTheDocument();
    expect(screen.queryByText('Ancien Titulaire')).not.toBeInTheDocument();
  });
});

describe('BonCreatePage — conflit de numéro de série au fil de la saisie (C6)', () => {
  const filiale = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveFilialesForTests();
  });

  it('signale un conflit dès la sortie du champ, avant toute soumission', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([filiale]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/equipment/serial-conflicts')) {
        return Promise.resolve({
          items: [{
            serialNumber: 'SN-999',
            bonId: 'b-autre',
            bonReference: 'BON-2026-0099',
            bonStatus: 'active',
            collaborateur: 'Marie Martin',
          }],
          truncated: false,
        });
      }
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });

    renderWithProviders(<BonCreatePage />);
    await user.type(screen.getAllByPlaceholderText('Libellé personnalisé')[0], 'Laptop A');
    await user.type(screen.getByPlaceholderText('SN-XXXXX'), 'SN-999');
    await user.tab();

    expect(await screen.findByText(/Déjà en circulation sur BON-2026-0099/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('BonCreatePage — brouillon local conservé (C5)', () => {
  const filiale = { id: 'f1', name: 'siege', displayName: 'Siège', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    resetActiveFilialesForTests();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/filiales/active')) return Promise.resolve([filiale]);
      if (path.startsWith('/equipment/catalog')) return Promise.resolve([]);
      if (path.startsWith('/equipment/packs')) return Promise.resolve([]);
      if (path.startsWith('/users/search')) {
        return Promise.resolve([{ id: 'u1', displayName: 'Jean Dupont', email: 'jean@livio.fr' }]);
      }
      if (path.startsWith('/equipment/serial-conflicts')) return Promise.resolve({ items: [], truncated: false });
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  it('conserve la saisie en cours et la restaure à la réouverture de la page', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<BonCreatePage />);

    await user.type(screen.getByPlaceholderText('Informations complémentaires...'), 'Écran fissuré à vérifier');
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain('Écran fissuré'));
    unmount();

    renderWithProviders(<BonCreatePage />);
    expect(await screen.findByText(/Brouillon restauré/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Informations complémentaires...')).toHaveValue('Écran fissuré à vérifier');
  });

  it('« Repartir de zéro » efface le brouillon restauré et revient aux valeurs par défaut', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<BonCreatePage />);
    await user.type(screen.getByPlaceholderText('Informations complémentaires...'), 'À reprendre plus tard');
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull());
    unmount();

    renderWithProviders(<BonCreatePage />);
    await screen.findByText(/Brouillon restauré/i);
    await user.click(screen.getByRole('button', { name: 'Repartir de zéro' }));

    expect(screen.queryByText(/Brouillon restauré/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Informations complémentaires...')).toHaveValue('');
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('efface le brouillon local une fois le bon créé', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'nouveau-bon' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(<BonCreatePage />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Jean');
    await user.click(await screen.findByText('Jean Dupont'));
    await user.click(screen.getByText('Sélectionner une filiale...'));
    await user.click(await screen.findByRole('option', { name: 'Siège' }));
    await user.type(screen.getAllByPlaceholderText('Libellé personnalisé')[0], 'Laptop A');
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull());

    await user.click(screen.getByRole('button', { name: /créer le bon/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});
