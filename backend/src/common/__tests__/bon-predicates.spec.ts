import { LOANED_BON_STATUSES } from '../../bons/bon-status';
import {
  PARTIAL_PENDING_SIGNATURE_TYPES,
  COLLAB_SIGNATURE_TYPES,
  DEFAULT_SIGNATURE_OVERDUE_DAYS,
  INVALIDATED_TOKEN_SENTINEL,
  overdueCutoff,
  buildOverdueSignatureWhere,
  overdueSignatureSql,
  buildLoanedEquipmentWhere,
  loanedEquipmentSql,
  SITUATION_ORDER,
  SITUATION_LABELS,
  SITUATION_BON_STATUSES,
  PARC_BON_STATUSES,
  situationForBonStatus,
  buildParcEquipmentWhere,
  parcEquipmentSql,
  situationCaseSql,
  buildSituationBreakdown,
} from '../bon-predicates';

describe('bon-predicates — constantes', () => {
  it('expose les types de signature attendus', () => {
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

describe('situations — définition élargie du parc en circulation (audit 2026-09-18)', () => {
  it('SITUATION_ORDER couvre les 3 situations dans l’ordre attendu', () => {
    expect(SITUATION_ORDER).toEqual(['en_attente_signature', 'en_circulation', 'en_litige']);
  });

  it('SITUATION_LABELS fournit un libellé FR par situation', () => {
    expect(SITUATION_LABELS).toEqual({
      en_attente_signature: 'Remise à signer',
      en_circulation: 'En circulation',
      en_litige: 'En litige',
    });
  });

  it('SITUATION_BON_STATUSES associe les statuts attendus à chaque situation', () => {
    expect(SITUATION_BON_STATUSES).toEqual({
      en_attente_signature: ['sent_mise_dispo'],
      en_circulation: ['active', 'sent_restitution', 'partially_returned'],
      en_litige: ['contested'],
    });
  });

  it('PARC_BON_STATUSES est l’union exacte des 3 situations (5 statuts, sans doublon)', () => {
    expect(PARC_BON_STATUSES).toEqual([
      'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
    ]);
    expect(new Set(PARC_BON_STATUSES).size).toBe(PARC_BON_STATUSES.length);
    // Corrige l'audit : sent_mise_dispo et contested rejoignent la définition
    // du parc en circulation, absents de l'ancien LOANED_BON_STATUSES.
    expect(PARC_BON_STATUSES).toEqual(expect.arrayContaining([...LOANED_BON_STATUSES]));
    expect(PARC_BON_STATUSES).toContain('sent_mise_dispo');
    expect(PARC_BON_STATUSES).toContain('contested');
  });

  describe('situationForBonStatus', () => {
    it.each([
      ['sent_mise_dispo', 'en_attente_signature'],
      ['active', 'en_circulation'],
      ['sent_restitution', 'en_circulation'],
      ['partially_returned', 'en_circulation'],
      ['contested', 'en_litige'],
    ] as const)('%s → %s', (status, expected) => {
      expect(situationForBonStatus(status)).toBe(expected);
    });

    it.each(['draft', 'archived', 'cancelled', 'inconnu'])(
      'renvoie null pour un statut hors du parc en circulation (%s)',
      (status) => {
        expect(situationForBonStatus(status)).toBeNull();
      },
    );
  });

  describe('buildParcEquipmentWhere', () => {
    it('inclut les 3 clauses de base (5 statuts) sans filiale', () => {
      const where = buildParcEquipmentWhere();
      expect(where.AND).toEqual([
        { returnedAt: null },
        { notReturned: false },
        { bon: { status: { in: ['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested'] } } },
      ]);
    });

    it('ajoute le filtre filiale quand fourni', () => {
      const where = buildParcEquipmentWhere({ filialeId: 'f-1' });
      expect(where.AND).toContainEqual({ bon: { filialeId: 'f-1' } });
      expect(where.AND).toHaveLength(4);
    });
  });

  describe('parcEquipmentSql', () => {
    it('caste b.status::text et référence les 5 statuts élargis', () => {
      const sql = parcEquipmentSql();
      expect(sql.sql).toContain('b.status::text IN (');
      expect(sql.sql).not.toMatch(/b\.status IN \(/);
      expect(sql.values).toEqual(['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested']);
    });
  });

  describe('situationCaseSql', () => {
    it('produit un CASE couvrant en_attente_signature et en_litige, ELSE en_circulation', () => {
      const sql = situationCaseSql();
      expect(sql.sql).toContain('CASE');
      expect(sql.sql).toContain("THEN 'en_attente_signature'");
      expect(sql.sql).toContain("THEN 'en_litige'");
      expect(sql.sql).toContain("ELSE 'en_circulation'");
      expect(sql.values).toEqual(['sent_mise_dispo', 'contested']);
    });
  });

  describe('buildSituationBreakdown', () => {
    it('zéro-complète les situations absentes du résultat SQL', () => {
      const breakdown = buildSituationBreakdown([{ situation: 'en_circulation', count: 4 }]);
      expect(breakdown).toEqual([
        { situation: 'en_attente_signature', label: 'Remise à signer', count: 0 },
        { situation: 'en_circulation', label: 'En circulation', count: 4 },
        { situation: 'en_litige', label: 'En litige', count: 0 },
      ]);
    });

    it('respecte SITUATION_ORDER même si les lignes SQL arrivent dans un autre ordre', () => {
      const breakdown = buildSituationBreakdown([
        { situation: 'en_litige', count: 2 },
        { situation: 'en_attente_signature', count: 3 },
        { situation: 'en_circulation', count: 100 },
      ]);
      expect(breakdown.map((b) => b.situation)).toEqual(['en_attente_signature', 'en_circulation', 'en_litige']);
      expect(breakdown.reduce((sum, b) => sum + b.count, 0)).toBe(105);
    });

    it('tableau vide → les 3 situations à 0', () => {
      expect(buildSituationBreakdown([])).toEqual([
        { situation: 'en_attente_signature', label: 'Remise à signer', count: 0 },
        { situation: 'en_circulation', label: 'En circulation', count: 0 },
        { situation: 'en_litige', label: 'En litige', count: 0 },
      ]);
    });
  });
});
