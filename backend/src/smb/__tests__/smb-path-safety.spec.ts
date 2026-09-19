import { isSafeSmbExportPath } from '../smb-path-safety';

describe('isSafeSmbExportPath', () => {
  it('accepts a normal export path (cas nominal)', () => {
    expect(isSafeSmbExportPath('/mnt/share/bons')).toBe(true);
  });

  it('accepts a Windows UNC path', () => {
    expect(isSafeSmbExportPath('\\\\server\\share\\bons')).toBe(true);
  });

  it('rejects an empty or non-string path', () => {
    expect(isSafeSmbExportPath('')).toBe(false);
    expect(isSafeSmbExportPath(undefined as unknown as string)).toBe(false);
  });

  // path.resolve() résout un chemin commençant par "/" par rapport au lecteur
  // courant sous Windows (ex. "C:\etc"), pas "/etc" — ce test Unix ne peut
  // donc s'exécuter que sur Linux/Docker (production). Même limitation déjà
  // documentée dans smb.service.spec.ts ("should reject unsafe export paths").
  (process.platform === 'win32' ? it.skip : it)('rejects a Linux system directory (cas limite)', () => {
    expect(isSafeSmbExportPath('/etc')).toBe(false);
    expect(isSafeSmbExportPath('/etc/passwd')).toBe(false);
  });

  // Symétrique du test précédent : hors Windows (CI et production Linux),
  // path.resolve() lit "C:\Windows" comme un chemin RELATIF (préfixé du
  // répertoire courant), qui n'est donc pas un dossier système. Ce test n'a
  // de sens que là où ces lettres de lecteur existent.
  (process.platform === 'win32' ? it : it.skip)('rejects a Windows system directory regardless of case (cas limite)', () => {
    expect(isSafeSmbExportPath('C:\\Windows\\System32')).toBe(false);
    expect(isSafeSmbExportPath('c:\\program files\\App')).toBe(false);
  });
});
