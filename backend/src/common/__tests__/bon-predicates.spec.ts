import {
  LOANED_BON_STATUSES,
  CLOSED_BON_STATUSES,
  IN_PROGRESS_BON_STATUSES,
  WAITING_SIGNATURE_STATUSES,
  PARTIAL_PENDING_SIGNATURE_TYPES,
  COLLAB_SIGNATURE_TYPES,
  DEFAULT_SIGNATURE_OVERDUE_DAYS,
  INVALIDATED_TOKEN_SENTINEL,
  overdueCutoff,
  buildOverdueSignatureWhere,
  overdueSignatureSql,
  buildLoanedEquipmentWhere,
  loanedEquipmentSql,
  CATEGORY_LABELS,
  escapeCsvCell,
} from '../bon-predicates';

describe('bon-predicates — constantes', () => {
  it('expose les listes de statuts attendues', () => {
    expect(LOANED_BON_STATUSES).toEqual(['active', 'sent_restitution', 'partially_returned']);
    expect(CLOSED_BON_STATUSES).toEqual(['archived', 'cancelled']);
    expect(IN_PROGRESS_BON_STATUSES).toEqual([
      'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
    ]);
    expect(WAITING_SIGNATURE_STATUSES).toEqual(['sent_mise_dispo', 'sent_restitution']);
    expect(PARTIAL_PENDING_SIGNATURE_TYPES).toEqual(['restitution', 'pv_cloture']);
    expect(COLLAB_SIGNATURE_TYPES).toEqual(['mise_disposition', 'restitution', 'pv_cloture']);
  });

  it('DEFAULT_SIGNATURE_OVERDUE_DAYS vaut 7', () => {
    expect(DEFAULT_SIGNATURE_OVERDUE_DAYS).toBe(7);
  });

  it('INVALIDATED_TOKEN_SENTINEL est epoch + 1 seconde', () => {
    expect(INVALIDATED_TOKEN_SENTINEL.getTime()).toBe(1000);
  });
});

describe('overdueCutoff', () => {
  it('soustrait N jours à `now`', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    expect(overdueCutoff(7, now).toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('utilise `new Date()` par défaut quand `now` est omis', () => {
    const before = Date.now();
    const cutoff = overdueCutoff(1);
    const after = Date.now();
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000);
  });
});

describe('buildOverdueSignatureWhere', () => {
  it('construit le where Prisma attendu (updatedAt < cutoff, OR statuts / partiel)', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const where = buildOverdueSignatureWhere(7, now);

    expect(where.updatedAt).toEqual({ lt: new Date('2026-09-09T00:00:00.000Z') });
    expect(where.OR).toEqual([
      { status: { in: ['sent_mise_dispo', 'sent_restitution'] } },
      {
        status: 'partially_returned',
        signatures: {
          some: {
            signed: false,
            type: { in: ['restitution', 'pv_cloture'] },
            tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
          },
        },
      },
    ]);
  });

  it('un cutoff différent (10 j) déplace la borne updatedAt', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const where10 = buildOverdueSignatureWhere(10, now);
    expect((where10.updatedAt as { lt: Date }).lt.toISOString()).toBe('2026-09-06T00:00:00.000Z');
  });
});

describe('overdueSignatureSql', () => {
  it('caste b.status en ::text et référence to_timestamp(1) (sentinelle)', () => {
    const sql = overdueSignatureSql(7);
    expect(typeof sql.sql).toBe('string');
    expect(sql.sql).toContain('b.status::text IN (');
    expect(sql.sql).toContain('s.type::text IN (');
    expect(sql.sql).toContain('to_timestamp(1)');
    expect(sql.sql).not.toMatch(/b\.status IN \(/);
  });

  it('lie thresholdDays comme paramètre (pas de concaténation)', () => {
    const sql = overdueSignatureSql(7);
    expect(sql.values).toContain(7);
  });
});

describe('buildLoanedEquipmentWhere', () => {
  it('inclut les 3 clauses de base sans filiale', () => {
    const where = buildLoanedEquipmentWhere();
    expect(where.AND).toEqual([
      { returnedAt: null },
      { notReturned: false },
      { bon: { status: { in: ['active', 'sent_restitution', 'partially_returned'] } } },
    ]);
  });

  it('ajoute le filtre filiale quand fourni', () => {
    const where = buildLoanedEquipmentWhere({ filialeId: 'f-1' });
    expect(where.AND).toContainEqual({ bon: { filialeId: 'f-1' } });
    expect(where.AND).toHaveLength(4);
  });
});

describe('loanedEquipmentSql', () => {
  it('caste b.status::text et référence les 3 statuts prêtés', () => {
    const sql = loanedEquipmentSql();
    expect(sql.sql).toContain('b.status::text IN (');
    expect(sql.sql).not.toMatch(/b\.status IN \(/);
  });
});

describe('CATEGORY_LABELS', () => {
  it('couvre les catégories connues', () => {
    expect(CATEGORY_LABELS.pc_portable).toBe('PC portable');
    expect(CATEGORY_LABELS.ecran).toBe('Écran');
    expect(CATEGORY_LABELS.autre).toBe('Autre');
  });
});

describe('escapeCsvCell — anti-injection de formule (Excel/LibreOffice)', () => {
  it.each([
    ['=', '=SOMME(A1)'],
    ['+', '+1234567'],
    ['-', '-1234567'],
    ['@', '@cmd|/c calc'],
    ['tabulation', '\tcmd'],
    ['retour chariot', '\rcmd'],
  ])('préfixe d’une apostrophe une cellule commençant par « %s »', (_label, value) => {
    expect(escapeCsvCell(value)).toBe(`"'${value}"`);
  });

  it('n’altère pas une cellule sans caractère déclencheur de formule', () => {
    expect(escapeCsvCell('Dell')).toBe('"Dell"');
  });

  it('double les guillemets internes', () => {
    expect(escapeCsvCell('12" écran')).toBe('"12"" écran"');
  });
});
