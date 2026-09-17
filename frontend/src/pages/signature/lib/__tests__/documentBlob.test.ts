import { describe, it, expect, vi } from 'vitest';
import { loadBlobIntoTab, POPUP_BLOCKED_MESSAGE } from '../documentBlob';

function mockWindow() {
  const listeners: Record<string, () => void> = {};
  return {
    addEventListener: vi.fn((event: string, cb: () => void) => { listeners[event] = cb; }),
    location: { href: '' },
    close: vi.fn(),
    opener: null,
    triggerLoad: () => listeners.load?.(),
  } as unknown as Window & { triggerLoad: () => void };
}

describe('loadBlobIntoTab', () => {
  it('loads the blob URL into the tab and returns null on success', async () => {
    const win = mockWindow();
    const blob = new Blob(['pdf-bytes']);
    // jsdom ne fournit pas URL.createObjectURL/revokeObjectURL — on les stub
    // directement plutôt que via vi.spyOn (qui exige que la propriété existe déjà).
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    const err = await loadBlobIntoTab(win, () => Promise.resolve(blob));

    expect(err).toBeNull();
    expect(win.location.href).toBe('blob:fake-url');
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('closes the tab and returns an error message when the fetch rejects', async () => {
    const win = mockWindow();

    const err = await loadBlobIntoTab(win, () => Promise.reject(new Error('boom')));

    expect(err).toBe('boom');
    expect(win.close).toHaveBeenCalled();
  });

  it('exposes the popup-blocked message constant for callers with no tab handle', () => {
    expect(POPUP_BLOCKED_MESSAGE).toMatch(/pop-up/i);
  });
});
