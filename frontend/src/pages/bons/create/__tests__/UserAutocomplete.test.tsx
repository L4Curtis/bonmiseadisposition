import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserAutocomplete } from '../UserAutocomplete';
import { resetActiveFilialesForTests } from '@/hooks/use-active-filiales';

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
import type { UserRole } from '@/types';

// Rôle de la personne connectée, modifiable test par test : la création d'un
// compte manuel depuis le formulaire de bon est réservée à l'administrateur.
let roleConnecte: UserRole = 'admin';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'moi', role: roleConnecte, displayName: 'Moi', email: 'moi@groupe-livio.fr' },
    loading: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('UserAutocomplete — création d\'un collaborateur manuel (administrateur)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetActiveFilialesForTests();
    roleConnecte = 'admin';
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users/search')) return Promise.resolve([]);
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  it('propose de créer un collaborateur quand la recherche ne donne aucun résultat, puis le sélectionne automatiquement', async () => {
    // pointerEventsCheck: 0 — cf. BonCreate.test.tsx : Radix <Dialog>/<Select>
    // basculent pointer-events sur <body> pendant l'animation, non garantie
    // terminée en jsdom.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    vi.mocked(api.post).mockResolvedValue({
      id: 'new-1',
      displayName: 'Marc Ouvrier',
      email: null,
      department: null,
      isManualAccount: true,
    });

    render(<UserAutocomplete value={null} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Ouvrier');
    await screen.findByText('Aucun collaborateur trouvé');

    await user.click(screen.getByRole('button', { name: /Créer un collaborateur/i }));

    // Le nom est prérempli avec la recherche déjà saisie.
    const lastNameInput = await screen.findByLabelText('Nom *') as HTMLInputElement;
    expect(lastNameInput.value).toBe('Ouvrier');

    await user.type(screen.getByLabelText('Prénom *'), 'Marc');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/manual', {
        firstName: 'Marc',
        lastName: 'Ouvrier',
        email: '',
        department: '',
      });
    });
    expect(onChange).toHaveBeenCalledWith({
      id: 'new-1',
      displayName: 'Marc Ouvrier',
      email: null,
      department: null,
    });
  });

  it('affiche une erreur et ne sélectionne rien si la création échoue', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();
    vi.mocked(api.post).mockRejectedValue(new Error('Erreur serveur'));

    render(<UserAutocomplete value={null} onChange={onChange} />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Inconnu');
    await screen.findByText('Aucun collaborateur trouvé');
    await user.click(screen.getByRole('button', { name: /Créer un collaborateur/i }));

    await user.type(await screen.findByLabelText('Prénom *'), 'Jean');
    await user.clear(screen.getByLabelText('Nom *'));
    await user.type(screen.getByLabelText('Nom *'), 'Personne');
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await screen.findByRole('alert');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('UserAutocomplete — affichage d\'un email absent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetActiveFilialesForTests();
  });

  it('affiche « — » pour un résultat de recherche sans email', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue([{ id: 'u2', displayName: 'Alex Sans Email', email: null }]);

    render(<UserAutocomplete value={null} onChange={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Alex');

    await screen.findByText('Alex Sans Email');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('affiche « — » pour le collaborateur déjà sélectionné sans email', () => {
    render(<UserAutocomplete value={{ id: 'u3', displayName: 'Sans Email', email: null }} onChange={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('UserAutocomplete — le dialogue ne soumet pas le formulaire parent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetActiveFilialesForTests();
    roleConnecte = 'admin';
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users/search')) return Promise.resolve([]);
      if (path.startsWith('/filiales/active')) return Promise.resolve([]);
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  // Le contenu du dialogue est rendu dans un portail : dans l'arbre React il
  // reste enfant du formulaire de création de bon, et sa soumission remontait
  // au parent, qui affichait « Sélectionnez un collaborateur » alors que la
  // création venait d'aboutir.
  it('crée le collaborateur sans déclencher la soumission du formulaire englobant', async () => {
    const utilisateur = userEvent.setup();
    const onSubmitParent = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    vi.mocked(api.post).mockResolvedValue({
      id: 'u-chantier',
      displayName: 'Marc DUPONT',
      email: null,
      department: null,
      isManualAccount: true,
    } as never);
    const onChange = vi.fn();

    render(
      <form onSubmit={onSubmitParent}>
        <UserAutocomplete value={null} onChange={onChange} />
        <button type="submit">Créer le bon</button>
      </form>,
    );

    await utilisateur.type(screen.getByLabelText('Rechercher un collaborateur'), 'Dupont');
    await utilisateur.click(await screen.findByRole('button', { name: /créer un collaborateur/i }));
    await utilisateur.type(screen.getByLabelText(/prénom/i), 'Marc');
    await utilisateur.type(screen.getByLabelText(/^nom/i), 'Dupont');
    await utilisateur.click(screen.getByRole('button', { name: /^créer$/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-chantier' })));
    expect(onSubmitParent).not.toHaveBeenCalled();
  });
});

describe('UserAutocomplete — technicien : pas de création de compte', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetActiveFilialesForTests();
    roleConnecte = 'technician';
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith('/users/search')) return Promise.resolve([]);
      return Promise.reject(new Error(`GET non mocké dans ce test : ${path}`));
    });
  });

  it('cherche toujours le destinataire, mais ne propose pas de créer un collaborateur', async () => {
    const user = userEvent.setup();
    render(<UserAutocomplete value={null} onChange={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Rechercher un collaborateur...'), 'Ouvrier');
    await screen.findByText('Aucun collaborateur trouvé');

    // La recherche part après la saisie (anti-rebond) : on attend son appel.
    await waitFor(() => {
      expect(vi.mocked(api.get).mock.calls.map(([path]) => path)).toContain('/users/search?q=Ouvrier');
    });
    expect(screen.queryByRole('button', { name: /Créer un collaborateur/i })).not.toBeInTheDocument();
    expect(screen.getByText('Collaborateur introuvable ? Demandez à un administrateur de créer sa fiche.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
