import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryBonsDto, toBonListQuery, MAX_SELECTED_IDS } from '../query-bons.dto';
import { ResendBatchDto, MAX_RESEND_BATCH } from '../actions.dto';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(QueryBonsDto, query);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

describe('QueryBonsDto — tri', () => {
  it('accepte chaque champ de la liste blanche et les deux sens', async () => {
    for (const sort of ['reference', 'dateMiseDisposition', 'createdAt', 'updatedAt', 'status', 'collaborateur', 'filiale']) {
      expect(await errorsFor({ sort, order: 'asc' })).toEqual([]);
    }
    expect(await errorsFor({ sort: 'createdAt', order: 'desc' })).toEqual([]);
  });

  it('refuse un champ hors liste blanche (400) — pas de tri sur une colonne arbitraire', async () => {
    expect(await errorsFor({ sort: 'notes' })).toEqual(['sort']);
    expect(await errorsFor({ sort: 'collaborateur.email' })).toEqual(['sort']);
    expect(await errorsFor({ sort: 'createdAt; DROP TABLE bons' })).toEqual(['sort']);
  });

  it('refuse un sens de tri inconnu', async () => {
    expect(await errorsFor({ order: 'ASC' })).toEqual(['order']);
    expect(await errorsFor({ order: 'random' })).toEqual(['order']);
  });
});

describe('QueryBonsDto — filtres', () => {
  it('accepte une période au format AAAA-MM-JJ', async () => {
    expect(await errorsFor({ dateFrom: '2026-01-01', dateTo: '2026-12-31' })).toEqual([]);
  });

  it('refuse une date mal formée ou inexistante', async () => {
    expect(await errorsFor({ dateFrom: '01/02/2026' })).toEqual(['dateFrom']);
    expect(await errorsFor({ dateTo: '2026-02-30' })).toEqual(['dateTo']);
    expect(await errorsFor({ dateTo: '2026-02-01T00:00:00Z' })).toEqual(['dateTo']);
  });

  it('lit noReturnDate comme un booléen de query string', async () => {
    const dto = plainToInstance(QueryBonsDto, { noReturnDate: '1' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.noReturnDate).toBe(true);
  });

  it('exige un UUID pour createdById', async () => {
    expect(await errorsFor({ createdById: UUID_A })).toEqual([]);
    expect(await errorsFor({ createdById: 'moi' })).toEqual(['createdById']);
  });

  it('accepte ids en « a,b » et plafonne la sélection', async () => {
    const dto = plainToInstance(QueryBonsDto, { ids: `${UUID_A},${UUID_B}` });
    expect(await validate(dto)).toEqual([]);
    expect(dto.ids).toEqual([UUID_A, UUID_B]);

    expect(await errorsFor({ ids: 'pas-un-uuid' })).toEqual(['ids']);
    const tooMany = Array.from({ length: MAX_SELECTED_IDS + 1 }, () => UUID_A);
    expect(await errorsFor({ ids: tooMany })).toEqual(['ids']);
  });
});

describe('toBonListQuery', () => {
  it('reprend les filtres et le tri du DTO', () => {
    const dto = plainToInstance(QueryBonsDto, {
      search: 'x', sort: 'reference', order: 'asc', dateFrom: '2026-01-01', dateTo: '2026-01-31',
      noReturnDate: 'true', createdById: UUID_A, page: '2', limit: '10',
    });
    expect(toBonListQuery(dto)).toEqual(expect.objectContaining({
      search: 'x', sort: 'reference', order: 'asc', dateFrom: '2026-01-01', dateTo: '2026-01-31',
      noReturnDate: true, createdById: UUID_A,
    }));
    expect(toBonListQuery(dto)).not.toHaveProperty('page');
  });

  it('refuse une période dont le début suit la fin', () => {
    const dto = plainToInstance(QueryBonsDto, { dateFrom: '2026-03-01', dateTo: '2026-02-01' });
    expect(() => toBonListQuery(dto)).toThrow(BadRequestException);
  });

  it('accepte une période d’un seul jour', () => {
    const dto = plainToInstance(QueryBonsDto, { dateFrom: '2026-03-01', dateTo: '2026-03-01' });
    expect(() => toBonListQuery(dto)).not.toThrow();
  });
});

describe('ResendBatchDto', () => {
  async function batchErrors(body: Record<string, unknown>): Promise<string[]> {
    return (await validate(plainToInstance(ResendBatchDto, body))).map((e) => e.property);
  }

  it('accepte une liste d’identifiants et force facultatif', async () => {
    expect(await batchErrors({ ids: [UUID_A, UUID_B] })).toEqual([]);
    expect(await batchErrors({ ids: [UUID_A], force: true })).toEqual([]);
  });

  it('refuse une liste vide, trop longue ou invalide', async () => {
    expect(await batchErrors({ ids: [] })).toEqual(['ids']);
    expect(await batchErrors({ ids: Array.from({ length: MAX_RESEND_BATCH + 1 }, () => UUID_A) })).toEqual(['ids']);
    expect(await batchErrors({ ids: ['x'] })).toEqual(['ids']);
    expect(await batchErrors({ ids: [UUID_A], force: 'oui' })).toEqual(['force']);
  });
});
