/**
 * Catalogue des actions du journal d'audit (contracts/audit-actions.ts).
 *
 * « Liste vivante » : les sources du backend sont relues pour retrouver chaque
 * nom d'action écrit dans le journal ; une action écrite sans entrée au
 * catalogue fait échouer ce test, tout comme une entrée du catalogue que plus
 * rien n'écrit sans être marquée `legacy`.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_DOMAINS,
  AUDIT_SYSTEM_ACTOR,
  fillAuditSentence,
  type AuditActionDefinition,
} from '../../contracts/audit-actions';

const SRC = path.resolve(__dirname, '..', '..');
const CATALOG: Readonly<Record<string, AuditActionDefinition>> = AUDIT_ACTIONS;

/** `signed_${sig.type}` (signature/signing.ts) : un document signé par lien,
 *  donc tout `SignatureType` sauf `it_cachet` (LinkDocumentType). */
const DYNAMIC_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  'signed_${sig.type}': ['signed_mise_disposition', 'signed_restitution', 'signed_pv_cloture'],
};

/** Littéraux `action: '…'` des fichiers d'audit qui ne sont pas des actions du
 *  journal : tri (`orderBy: { action: 'asc' }`), gestes du cycle de vie
 *  (`GestureSpec.action`, paramètre `action: 'send' | …`). */
const NOT_AUDIT_LITERALS = new Set(['asc', 'send', 'handover_without_signature', 'closed_without_signature']);

/** Actions que la vague 3 va écrire (lots 3B et 3C) : au catalogue avant leur
 *  première écriture. */
const PLANNED_ACTIONS = new Set([
  'filiale_created',
  'filiale_updated',
  'filiale_deactivated',
  'filiale_reactivated',
  'filiale_deleted',
  'filiale_stamp_updated',
  'filiale_logo_updated',
  'config_updated',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'contracts') sourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Un fichier qui écrit au journal, directement ou par le point unique. */
const WRITES_AUDIT = /auditLog|writeAuditEntry\(|\.record\(|\.recordSafely\(/;

const PATTERNS: readonly RegExp[] = [
  // action: 'x' — data d'une écriture directe (à migrer)
  /\baction:\s*'([a-z_]+)'/g,
  // auditAction: 'x' — spécification d'un geste (bon-without-signature.ts)
  /\bauditAction:\s*'([a-z_]+)'/g,
  // export const X_ACTION = 'x'
  /\b[A-Z_]+_ACTION\s*=\s*'([a-z_]+)'/g,
  // writeAudit(actorId, 'x', …) — users.service.ts
  /\bwriteAudit\(\s*\w+,\s*'([a-z_]+)'/g,
  // audit.record('x', …) / audit.recordSafely('x', …) — point unique
  /\.(?:record|recordSafely)\(\s*'([a-z_]+)'/g,
  // writeAuditEntry(tx, 'x', …) — dans une transaction
  /\bwriteAuditEntry\(\s*[\w.]+,\s*'([a-z_]+)'/g,
];
// action: cond ? 'a' : 'b'  /  const action = cond ? 'a' : 'b'  /  record(cond ? 'a' : 'b', …)
const TERNARIES: readonly RegExp[] = [
  /\baction\s*[:=][^;\n]*?\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g,
  /\.(?:record|recordSafely)\(\s*[^,;'()]*\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g,
  /\bwriteAuditEntry\(\s*[\w.]+,\s*[^,;'()]*\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g,
];
// const X_ACTIONS = { clé: 'action', … } — table de correspondance (signing.ts)
const ACTION_MAP = /\b[A-Z_]+_ACTIONS\b[^=\n]*=\s*(?:Object\.freeze\()?\{([^}]*)\}/g;
const MAP_VALUE = /:\s*'([a-z_]+)'/g;
// Nom construit : action: `…`, record(`…`), writeAuditEntry(tx, `…`)
const TEMPLATES: readonly RegExp[] = [
  /\baction:\s*`([^`]*)`/g,
  /\.(?:record|recordSafely)\(\s*`([^`]*)`/g,
  /\bwriteAuditEntry\(\s*[\w.]+,\s*`([^`]*)`/g,
];

interface Scan {
  readonly written: Map<string, Set<string>>;
  readonly unknownDynamic: string[];
}

function scanWrittenActions(): Scan {
  const written = new Map<string, Set<string>>();
  const unknownDynamic: string[] = [];
  const add = (name: string, file: string): void => {
    if (NOT_AUDIT_LITERALS.has(name)) return;
    const files = written.get(name) ?? new Set<string>();
    files.add(path.relative(SRC, file));
    written.set(name, files);
  };
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!WRITES_AUDIT.test(text)) continue;
    for (const pattern of PATTERNS) {
      for (const match of text.matchAll(pattern)) add(match[1], file);
    }
    for (const pattern of TERNARIES) {
      for (const match of text.matchAll(pattern)) {
        add(match[1], file);
        add(match[2], file);
      }
    }
    for (const map of text.matchAll(ACTION_MAP)) {
      for (const value of map[1].matchAll(MAP_VALUE)) add(value[1], file);
    }
    for (const pattern of TEMPLATES) {
      for (const match of text.matchAll(pattern)) {
        const expanded = DYNAMIC_ACTIONS[match[1]];
        if (expanded) expanded.forEach((name) => add(name, file));
        else unknownDynamic.push(`${path.relative(SRC, file)} : \`${match[1]}\``);
      }
    }
  }
  return { written, unknownDynamic };
}

describe('catalogue des actions du journal d’audit', () => {
  const scan = scanWrittenActions();

  it('retrouve les écritures du code (garde contre une lecture vide)', () => {
    expect(scan.written.size).toBeGreaterThanOrEqual(55);
    expect(scan.written.has('bon_created')).toBe(true);
    expect(scan.written.has('signed_pv_cloture')).toBe(true);
    expect(scan.written.has('login_local_locked')).toBe(true);
  });

  it('connaît toute forme dynamique de nom d’action', () => {
    expect(scan.unknownDynamic).toEqual([]);
  });

  it('catalogue chaque action écrite dans le code', () => {
    const missing = [...scan.written.keys()].filter((name) => !(name in CATALOG)).sort();
    expect(missing).toEqual([]);
  });

  it('ne garde au catalogue que des actions écrites, anciennes ou prévues', () => {
    const stale = Object.entries(CATALOG)
      .filter(([name, def]) => !scan.written.has(name) && !def.legacy && !PLANNED_ACTIONS.has(name))
      .map(([name]) => name);
    expect(stale).toEqual([]);
  });

  it('ne marque `legacy` aucune action encore écrite', () => {
    const stillWritten = Object.entries(CATALOG)
      .filter(([name, def]) => def.legacy && scan.written.has(name))
      .map(([name]) => name);
    expect(stillWritten).toEqual([]);
  });

  it.each(Object.entries(CATALOG))('%s : gabarit bien formé', (_name, def) => {
    const { sentence } = def;
    expect(sentence.startsWith('{acteur} ')).toBe(true);
    expect(sentence.endsWith('.')).toBe(true);
    expect(sentence.trim()).toBe(sentence);
    let inSegment = false;
    let inPlaceholder = false;
    for (const char of sentence) {
      if (char === '[') {
        expect(inSegment || inPlaceholder).toBe(false);
        inSegment = true;
      } else if (char === ']') {
        expect(inSegment && !inPlaceholder).toBe(true);
        inSegment = false;
      } else if (char === '{') {
        expect(inPlaceholder).toBe(false);
        inPlaceholder = true;
      } else if (char === '}') {
        expect(inPlaceholder).toBe(true);
        inPlaceholder = false;
      }
    }
    expect(inSegment).toBe(false);
    expect(inPlaceholder).toBe(false);
    for (const match of sentence.matchAll(/\{([^}]*)\}/g)) {
      expect(match[1]).toMatch(/^[a-zA-Z]+$/);
    }
    // Aucun code brut (snake_case) hors variables.
    expect(sentence.replace(/\{[^}]*\}/g, '')).not.toMatch(/[a-z]+_[a-z]+/);
    expect(def.domain in AUDIT_ACTION_DOMAINS).toBe(true);
  });

  it('donne à chaque action un libellé non vide et unique', () => {
    const labels = Object.values(CATALOG).map((def) => def.label.trim());
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('fillAuditSentence', () => {
  it('un texte saisi qui finit par un point ne double pas la ponctuation', () => {
    const sentence = AUDIT_ACTIONS.bon_cancelled.sentence;
    expect(fillAuditSentence(sentence, { acteur: 'Julie Moreau', bon: 'BON-2026-0073', reason: 'Créé en double (recette).  ' }))
      .toBe('Julie Moreau a annulé le bon BON-2026-0073 (motif : Créé en double (recette)).');
    expect(fillAuditSentence(sentence, { acteur: 'Julie Moreau', bon: 'BON-2026-0073', reason: 'Doublon...' }))
      .toBe('Julie Moreau a annulé le bon BON-2026-0073 (motif : Doublon).');
  });

  it('remplace les variables, nombres compris', () => {
    expect(fillAuditSentence('{acteur} a exporté {rowCount} lignes.', { acteur: 'Alice Martin', rowCount: 571 }))
      .toBe('Alice Martin a exporté 571 lignes.');
    expect(fillAuditSentence('{a}{b}', { a: 0, b: 'x' })).toBe('0x');
  });

  it('retire un segment facultatif dont une variable est absente, nulle ou vide', () => {
    const template = '{acteur} a annulé le bon {bon}[ (motif : {reason})].';
    const base = { acteur: 'Alice', bon: 'BON-2026-0001' };
    const expected = 'Alice a annulé le bon BON-2026-0001.';
    expect(fillAuditSentence(template, base)).toBe(expected);
    expect(fillAuditSentence(template, { ...base, reason: null })).toBe(expected);
    expect(fillAuditSentence(template, { ...base, reason: '' })).toBe(expected);
    expect(fillAuditSentence(template, { ...base, reason: '   ' })).toBe(expected);
  });

  it('conserve un segment facultatif complet', () => {
    expect(fillAuditSentence('{acteur} a annulé le bon {bon}[ (motif : {reason})].', {
      acteur: 'Alice', bon: 'BON-2026-0001', reason: 'doublon',
    })).toBe('Alice a annulé le bon BON-2026-0001 (motif : doublon).');
    expect(fillAuditSentence('[x={x}, y={y}]', { x: 1 })).toBe('');
    expect(fillAuditSentence('[x={x}, y={y}]', { x: 1, y: 0 })).toBe('x=1, y=0');
  });

  it('remplace une variable obligatoire absente par un tiret', () => {
    expect(fillAuditSentence('{acteur} a signé le bon {bon}.', { acteur: 'Alice' })).toBe('Alice a signé le bon —.');
  });

  it('écrit « Le système » quand l’entrée n’a pas d’auteur', () => {
    expect(fillAuditSentence('{acteur} a agi.', {})).toBe(`${AUDIT_SYSTEM_ACTOR} a agi.`);
    expect(fillAuditSentence('{acteur} a agi.', { acteur: null })).toBe('Le système a agi.');
  });

  it('ne lit jamais le prototype et laisse intact un texte sans balise fermée', () => {
    expect(fillAuditSentence('{constructor}', {})).toBe('—');
    expect(fillAuditSentence('a [b {c', {})).toBe('a [b {c');
  });
});

describe('phrases des actions réelles (details tels que le code les écrit)', () => {
  const sentence = (action: keyof typeof AUDIT_ACTIONS, values: Record<string, string | number | null>): string =>
    fillAuditSentence(AUDIT_ACTIONS[action].sentence, values);

  it('bon_cancelled (bon-cancel.ts)', () => {
    expect(sentence('bon_cancelled', {
      acteur: 'Alice Martin', bon: 'BON-2026-0042', previousStatus: 'sent_mise_dispo', reason: 'Collaborateur parti',
    })).toBe('Alice Martin a annulé le bon BON-2026-0042 (motif : Collaborateur parti).');
  });

  it('bon_created, correction après contestation fondée (bon-replacement.ts)', () => {
    expect(sentence('bon_created', {
      acteur: 'Alice Martin', bon: 'BON-2026-0043', replacesBonId: 'b-1', replaces: 'BON-2026-0042', contestationId: 'c-1',
    })).toBe('Alice Martin a créé le bon BON-2026-0043 en remplacement du bon BON-2026-0042.');
    expect(sentence('bon_created', { acteur: 'Alice Martin', bon: 'BON-2026-0044' }))
      .toBe('Alice Martin a créé le bon BON-2026-0044.');
  });

  it('audit_exported (audit.service.ts)', () => {
    expect(sentence('audit_exported', { acteur: 'Bob Durand', rowCount: 571 }))
      .toBe("Bob Durand a exporté le journal d'audit (lignes : 571).");
  });

  it('attachment_uploaded, avant et après anonymisation du nom de fichier', () => {
    const values = { acteur: 'Bob Durand', bon: 'BON-2026-0042', stage: 'restitution', mimeType: 'application/pdf', size: 1024 };
    expect(sentence('attachment_uploaded', { ...values, filename: 'bon-signe.pdf' }))
      .toBe('Bob Durand a ajouté une pièce jointe (bon-signe.pdf) au bon BON-2026-0042.');
    expect(sentence('attachment_uploaded', values)).toBe('Bob Durand a ajouté une pièce jointe au bon BON-2026-0042.');
  });

  it('ldap_sync_aborted, écrite sans auteur (ldap-deactivation.ts)', () => {
    expect(sentence('ldap_sync_aborted', { toDeactivate: 120, total: 200, ratio: 0.6 }))
      .toBe("Le système a interrompu la synchronisation de l'annuaire, qui aurait désactivé 120 comptes sur 200.");
  });
});
