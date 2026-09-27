import { resolve } from 'node:path';
import * as serverLabels from '../bon-status';

/**
 * Parité des mots entre le serveur (emails, PDF, exports, messages d'erreur)
 * et les écrans : chaque libellé présent des deux côtés doit être la MÊME
 * chaîne, clé par clé et dans le même ordre. Le lexique des écrans est chargé
 * tel quel depuis le dépôt (ses seuls imports sont des types, effacés à la
 * compilation) : un mot changé d'un seul côté fait échouer ce test.
 */
const FRONT_LEXICON = resolve(__dirname, '../../../../frontend/src/domain/labels.ts');

/** Tables de libellés tenues des deux côtés (voir docs/architecture.md § 3). */
const SHARED_TABLES = [
  'BON_STATUS_LABELS',
  'BON_SUB_STATUS_LABELS',
  'CONTESTATION_OUTCOME_LABELS',
  'WITHOUT_SIGNATURE_ACTION_LABELS',
  'WITHOUT_SIGNATURE_DONE_LABELS',
  'LINK_INVALIDATION_LABELS',
  'LINK_INVALIDATION_MESSAGES',
  'CIVILITE_LABELS',
  'CIVILITE_LONG_LABELS',
] as const;

type LabelTable = Readonly<Record<string, string>>;

describe('libellés — mêmes mots côté serveur et côté écran', () => {
  let front: Record<string, unknown>;

  beforeAll(async () => {
    front = (await import(FRONT_LEXICON)) as Record<string, unknown>;
  });

  it.each(SHARED_TABLES)('%s est identique des deux côtés', (name) => {
    const server = (serverLabels as Record<string, unknown>)[name] as LabelTable;
    expect(front[name]).toBeDefined();
    expect(Object.entries(front[name] as LabelTable)).toEqual(Object.entries(server));
  });

  it('les deux fonctions de libellé de sous-état répondent pareil, clé inconnue comprise', () => {
    const frontLabel = front.bonSubStatusLabel as (subStatus: string) => string;
    for (const key of [...serverLabels.BON_SUB_STATUSES, 'inconnu']) {
      expect(frontLabel(key)).toBe(serverLabels.bonSubStatusLabel(key));
    }
  });
});
