import * as path from 'path';
import { computeSmbExportTarget } from '../smb-export-writer';
import { SmbBon } from '../../common/types';

const identity = (name: string): string => name;

describe('computeSmbExportTarget', () => {
  it('builds the target dir from filiale/year/reference_collaborateur (cas nominal)', () => {
    const bon: SmbBon = {
      reference: 'BON-2026-0001',
      createdAt: new Date('2026-03-15T00:00:00Z'),
      filiale: { displayName: 'Livio Paris' },
      collaborateur: { displayName: 'Jean Dupont' },
    };

    const target = computeSmbExportTarget('/mnt/share', bon, 'mise_disposition.pdf', identity);

    expect(target.targetDir).toBe(path.join('/mnt/share', 'Livio Paris', '2026', 'BON-2026-0001_Jean Dupont'));
    expect(target.safeFilename).toBe('mise_disposition.pdf');
  });

  it('falls back to "Sans-filiale" and "INCONNU" when filiale/collaborateur are missing (cas limite)', () => {
    const bon: SmbBon = { reference: 'BON-2026-0002' };

    const target = computeSmbExportTarget('/mnt/share', bon, 'x.pdf', identity);

    expect(target.filialeName).toBe('Sans-filiale');
    expect(target.dirName).toBe('BON-2026-0002_INCONNU');
  });

  it('strips any directory traversal from the filename via path.basename', () => {
    const bon: SmbBon = { reference: 'BON-2026-0003' };

    const target = computeSmbExportTarget('/mnt/share', bon, '../../../etc/passwd', identity);

    expect(target.safeFilename).toBe('passwd');
  });
});
