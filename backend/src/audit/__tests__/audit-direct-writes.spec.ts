/**
 * Écritures directes du journal d'audit (`auditLog.create`) qui restent à
 * faire passer par `AuditService.record` (ou `writeAuditEntry` dans une
 * transaction). La liste, par fichier, est comparée à
 * `__snapshots__/audit-direct-writes.md`, versionné : chaque lot de la vague 3
 * voit ainsi disparaître les lignes de son domaine. Après une migration :
 *   npx vitest run src/audit/__tests__/audit-direct-writes.spec.ts -u
 * Une NOUVELLE écriture directe fait échouer ce test (elle apparaîtrait dans
 * l'instantané) : écrire par `record` dès le départ.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..');
/** Le seul fichier autorisé à écrire dans la table. */
const SINGLE_WRITER = join('audit', 'audit-record.ts');
const DIRECT_WRITE = /auditLog\s*\.\s*create(?:Many)?\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function directWrites(): { file: string; count: number }[] {
  return sourceFiles(SRC)
    .map((path) => ({ file: relative(SRC, path), count: readFileSync(path, 'utf8').match(DIRECT_WRITE)?.length ?? 0 }))
    .filter(({ file, count }) => count > 0 && file !== SINGLE_WRITER)
    .map(({ file, count }) => ({ file: file.split(sep).join('/'), count }))
    .sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

describe('Écritures directes du journal d’audit', () => {
  const writes = directWrites();

  it('le relevé lit bien les sources (garde-fou contre un parcours vide)', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(200);
    expect(readFileSync(join(SRC, SINGLE_WRITER), 'utf8')).toMatch(DIRECT_WRITE);
  });

  it('reste à migrer vers AuditService.record, fichier par fichier', async () => {
    const total = writes.reduce((sum, w) => sum + w.count, 0);
    const table = [
      '# Écritures directes du journal d’audit restant à migrer',
      '',
      'Généré par `backend/src/audit/__tests__/audit-direct-writes.spec.ts` : ne pas modifier à la main.',
      'Cible : aucune ligne. Toute écriture passe par `AuditService.record` (ou `writeAuditEntry`).',
      '',
      `Total : ${total} écriture(s) dans ${writes.length} fichier(s).`,
      '',
      '| Fichier | Écritures |',
      '|---|---|',
      ...writes.map((w) => `| ${w.file} | ${w.count} |`),
      '',
    ].join('\n');
    await expect(table).toMatchFileSnapshot('__snapshots__/audit-direct-writes.md');
  });
});
