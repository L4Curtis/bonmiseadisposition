import { describe, it, expect } from 'vitest';
import { filenameFromContentDisposition } from '../content-disposition';

describe('filenameFromContentDisposition', () => {
  it('lit un nom entre guillemets (forme envoyée par le serveur)', () => {
    expect(filenameFromContentDisposition('attachment; filename="inventaire-2026-09-24.csv"'))
      .toBe('inventaire-2026-09-24.csv');
  });

  it('lit un nom sans guillemets', () => {
    expect(filenameFromContentDisposition('attachment; filename=journal.csv')).toBe('journal.csv');
  });

  it('préfère la forme encodée filename* (accents) à la forme simple', () => {
    const header = `attachment; filename="export.csv"; filename*=UTF-8''historique-%C3%A9quipement.csv`;
    expect(filenameFromContentDisposition(header)).toBe('historique-équipement.csv');
  });

  it('retombe sur filename quand filename* est mal encodé', () => {
    const header = `attachment; filename="secours.csv"; filename*=UTF-8''%E0%A4%A.csv`;
    expect(filenameFromContentDisposition(header)).toBe('secours.csv');
  });

  it('accepte un nom inline (aperçu PDF)', () => {
    expect(filenameFromContentDisposition('inline; filename="preview-42.pdf"')).toBe('preview-42.pdf');
  });

  it('retire un chemin : seul le nom de fichier est gardé', () => {
    expect(filenameFromContentDisposition('attachment; filename="../../etc/passwd"')).toBe('passwd');
    expect(filenameFromContentDisposition('attachment; filename=C:\\temp\\bon.pdf')).toBe('bon.pdf');
  });

  it('retire les caractères de contrôle', () => {
    expect(filenameFromContentDisposition('attachment; filename="bon\u0007.pdf"')).toBe('bon.pdf');
  });

  it('renvoie null sans en-tête, sans nom, ou avec un nom vide', () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition('attachment')).toBeNull();
    expect(filenameFromContentDisposition('attachment; filename=""')).toBeNull();
  });
});
