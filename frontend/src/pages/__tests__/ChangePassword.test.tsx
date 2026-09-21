import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ChangePasswordPage } from '../ChangePassword';

// Un nouveau mot de passe qui respecte changePasswordSchema (12 caractères
// minimum, majuscule, minuscule, chiffre, caractère spécial).
const NEW_PASSWORD = 'NewPassw0rd!2024';

function mockChangePasswordFetch() {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/change-password')) {
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }
    return Promise.reject(new Error(`fetch non mocké dans ce test : ${url}`));
  }) as unknown as typeof fetch;
}

// Les champs mot de passe n'ont pas de <label htmlFor> (juste un <label> visuel
// juxtaposé) : pas accessibles via getByLabelText, on les cible par ordre
// d'apparition dans le formulaire (actuel, nouveau, confirmation).
async function submitChangePassword(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const passwordInputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
  await user.type(passwordInputs[0], 'AncienMotDePasse1!');
  await user.type(passwordInputs[1], NEW_PASSWORD);
  await user.type(passwordInputs[2], NEW_PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }));
}

describe('ChangePasswordPage — respect de returnTo après succès', () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockChangePasswordFetch();
    originalLocation = window.location;
    // Même contournement que Login.test.tsx : jsdom lève "Not implemented:
    // navigation" sur une vraie assignation à location.href.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: originalLocation.origin, href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('redirige vers returnTo (lien profond) après un changement réussi', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MemoryRouter initialEntries={['/change-password?forced=true&returnTo=%2Fsigner%2Fabc123']}>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    await submitChangePassword(user, container);
    await screen.findByText('Mot de passe modifié');

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(window.location.href).toBe('/signer/abc123'));
  });

  it("retombe sur '/' quand returnTo est absent (comportement historique)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MemoryRouter initialEntries={['/change-password?forced=true']}>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    await submitChangePassword(user, container);
    await screen.findByText('Mot de passe modifié');

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(window.location.href).toBe('/'));
  });

  it("retombe sur '/' quand returnTo est un open redirect (protocol-relatif)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <MemoryRouter initialEntries={['/change-password?forced=true&returnTo=%2F%2Fevil.com']}>
        <ChangePasswordPage />
      </MemoryRouter>,
    );

    await submitChangePassword(user, container);
    await screen.findByText('Mot de passe modifié');

    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(window.location.href).toBe('/'));
  });
});
