import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ContestationDialog } from '../ContestationDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: { post: vi.fn() } };
});

import { api } from '@/lib/api';

/** Zone visible du téléphone (visualViewport) : elle rétrécit quand le clavier s'ouvre. */
class FakeVisualViewport extends EventTarget {
  height = 780;
  offsetTop = 0;
  resize(height: number, offsetTop = 0) {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event('resize'));
  }
}

function mockPhone(isPhone: boolean) {
  mockMedia((query) => isPhone && query.includes('max-width'));
}

function mockMedia(matches: (query: string) => boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderDialog() {
  return renderWithProviders(
    <ContestationDialog bonId="b1" bonRef="BON-1" document="pv_cloture" open onOpenChange={vi.fn()} onSuccess={vi.fn()} />,
  );
}

let viewport: FakeVisualViewport;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.resetAllMocks();
  viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
});

describe('ContestationDialog au doigt (2E)', () => {
  it('téléphone : la fenêtre se cale en haut de la zone visible et suit le clavier', async () => {
    mockPhone(true);
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.maxHeight).toBe('780px');

    act(() => viewport.resize(420, 12));
    expect(dialog.style.top).toBe('12px');
    expect(dialog.style.maxHeight).toBe('420px');
  });

  it('le champ touché reste visible au-dessus du clavier', async () => {
    mockPhone(true);
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const { user } = renderDialog();

    await user.click(await screen.findByLabelText('Motif de contestation'));
    act(() => viewport.resize(420));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    scrollIntoView.mockRestore();
  });

  it('téléphone couché (plus de 640 px de large, écran bas) : calée en haut de la zone visible, centrée en largeur', async () => {
    mockMedia((query) => query.includes('pointer: coarse') && query.includes('max-height'));
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    act(() => viewport.resize(180, 0));
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.maxHeight).toBe('180px');
    // La translation verticale de la fenêtre centrée est annulée, sinon la
    // moitié haute sortirait de l'écran.
    expect(dialog.style.transform).toBe('translate(-50%, 0)');
    expect(dialog.style.overflowY).toBe('auto');
  });

  it('téléphone couché, clavier ouvert : « Envoyer la contestation » reste collé en bas de la zone visible (CM n° 11)', async () => {
    mockMedia((query) => query.includes('pointer: coarse') && query.includes('max-height'));
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    act(() => viewport.resize(190, 0));
    const footer = screen.getByRole('button', { name: 'Envoyer la contestation' }).parentElement!;
    expect(footer.className).toMatch(/sticky/);
    expect(footer.className).toMatch(/bottom-0/);
    // Place comptée : l'explication passe aux lecteurs d'écran seulement, le
    // champ se réduit à 2 lignes.
    expect(screen.getByText(/Expliquez ce qui ne va pas/).className).toMatch(/sr-only/);
    expect(screen.getByLabelText('Motif de contestation')).toHaveAttribute('rows', '2');
    expect(dialog).toHaveAttribute('data-compact', 'true');
  });

  it('titre : la place de la croix de fermeture est réservée (CM n° 10)', async () => {
    mockPhone(true);
    renderDialog();
    expect((await screen.findByRole('heading', { name: /Contester le PV/ })).className).toMatch(/pr-10/);
  });

  it('téléphone : calée en haut dès le premier affichage, avant toute mesure de la zone visible', async () => {
    mockPhone(true);
    renderDialog();
    expect((await screen.findByRole('dialog')).className).toMatch(/max-sm:top-0/);
  });

  it('ordinateur : la fenêtre reste centrée, sans position imposée', async () => {
    mockPhone(false);
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.style.top).toBe('');
    expect(dialog.style.maxHeight).toBe('');
  });

  it('boutons de 44 px, et la saisie efface le message d’erreur dès la première lettre', async () => {
    mockPhone(true);
    const { user } = renderDialog();
    const send = await screen.findByRole('button', { name: 'Envoyer la contestation' });
    expect(send.className).toMatch(/min-h-11/);
    await user.click(send);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Motif de contestation'), 'L');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
