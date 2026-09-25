import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { saveBlob } from '../download';

describe('saveBlob', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:fichier');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('déclenche le téléchargement sous le nom demandé, sans laisser de lien dans la page', () => {
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });

    saveBlob(new Blob(['x']), 'journal-audit.csv');

    expect(clicked).toEqual([{ href: 'blob:fichier', download: 'journal-audit.csv' }]);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('libère l’adresse temporaire après coup (le navigateur a eu le temps de lire le fichier)', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob(new Blob(['x']), 'a.csv');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fichier');
  });
});
