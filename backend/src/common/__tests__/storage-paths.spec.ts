import { join, resolve } from 'path';
import {
  ATTACHMENTS_DIR,
  DATA_DIR,
  INITIAL_ADMIN_PASSWORD_FILE,
  SIGNATURES_DIR,
  UPLOADS_DIR,
  dataPath,
} from '../storage-paths';

describe('chemins de stockage', () => {
  it('toutes les données vivent sous data/, à la racine du processus (volume Docker)', () => {
    expect(DATA_DIR).toBe(join(process.cwd(), 'data'));
    expect(UPLOADS_DIR).toBe(join(DATA_DIR, 'uploads'));
    expect(SIGNATURES_DIR).toBe(join(DATA_DIR, 'signatures'));
    expect(ATTACHMENTS_DIR).toBe(join(DATA_DIR, 'attachments'));
    expect(INITIAL_ADMIN_PASSWORD_FILE).toBe(join(DATA_DIR, 'initial-admin-password.txt'));
  });

  it('dataPath résout un chemin stocké en base (ex. logo d’une filiale)', () => {
    expect(dataPath('uploads/logo-filiale.png')).toBe(join(DATA_DIR, 'uploads', 'logo-filiale.png'));
  });

  it('accepte un nom de fichier qui commence par deux points', () => {
    expect(dataPath('uploads/..logo.png')).toBe(join(DATA_DIR, 'uploads', '..logo.png'));
  });

  it.each(['../secrets.txt', 'uploads/../../etc/passwd', resolve('/etc/passwd'), ''])(
    'dataPath refuse un chemin qui sort du dossier de données (%s)',
    (relativePath) => {
      expect(() => dataPath(relativePath)).toThrow(/hors du dossier de données/);
    },
  );
});
