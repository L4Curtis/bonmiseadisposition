import { IsOptional, IsString } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { validationException } from '../../errors/validation-exception';
import { AppException } from '../../errors/app-exception';
import {
  DEFAULT_PAGE_SIZE,
  LargePaginationQueryDto,
  PaginationQueryDto,
  toPrismaPage,
} from '../pagination.dto';
import { toFullListResponse, toListResponse } from '../list-response';

/** Même réglage que le pipe global (bootstrap/configure-app.ts). */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationException,
});

async function parseQuery<T extends object>(dto: new () => T, query: Record<string, string>): Promise<T> {
  const metadata: ArgumentMetadata = { type: 'query', metatype: dto };
  return pipe.transform(query, metadata) as Promise<T>;
}

async function refusedFields(dto: new () => object, query: Record<string, string>): Promise<string[]> {
  try {
    await parseQuery(dto, query);
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const details = (error as AppException).details as { errors: { field: string }[] };
    return details.errors.map((e) => e.field);
  }
  throw new Error('requête acceptée à tort');
}

describe('PaginationQueryDto', () => {
  it('sans paramètre : page 1, 25 éléments', async () => {
    const query = await parseQuery(PaginationQueryDto, {});
    expect({ page: query.page, limit: query.limit }).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });

  it('lit page et limit, reçus en chaînes dans l’adresse', async () => {
    const query = await parseQuery(PaginationQueryDto, { page: '3', limit: '50' });
    expect({ page: query.page, limit: query.limit }).toEqual({ page: 3, limit: 50 });
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc']])('page « %s » refusée en 400, jamais corrigée', async (page) => {
    expect(await refusedFields(PaginationQueryDto, { page })).toEqual(['page']);
  });

  it.each([['10'], ['20'], ['200'], ['abc']])('limit « %s » refusée : seules 25, 50 et 100 sont admises', async (limit) => {
    expect(await refusedFields(PaginationQueryDto, { limit })).toEqual(['limit']);
  });

  it('paramètre inconnu refusé (liste blanche du pipe global)', async () => {
    expect(await refusedFields(PaginationQueryDto, { pagee: '2' })).toEqual(['pagee']);
  });

  it('se prolonge par héritage avec les filtres propres à la route', async () => {
    class BonsQuery extends PaginationQueryDto {
      @IsOptional()
      @IsString()
      search?: string;
    }
    const query = await parseQuery(BonsQuery, { search: 'BON-2026', limit: '100' });
    expect({ search: query.search, limit: query.limit, page: query.page }).toEqual({ search: 'BON-2026', limit: 100, page: 1 });
  });
});

describe('LargePaginationQueryDto (inventaire)', () => {
  it('admet 200 en plus des tailles communes', async () => {
    expect((await parseQuery(LargePaginationQueryDto, { limit: '200' })).limit).toBe(200);
    expect(await refusedFields(LargePaginationQueryDto, { limit: '500' })).toEqual(['limit']);
  });
});

describe('toPrismaPage', () => {
  it('traduit page et limit en skip et take', () => {
    expect(toPrismaPage({ page: 1, limit: 25 })).toEqual({ skip: 0, take: 25 });
    expect(toPrismaPage({ page: 3, limit: 50 })).toEqual({ skip: 100, take: 50 });
  });
});

describe('toListResponse', () => {
  it('forme unique { items, total, page, limit, truncated }', () => {
    expect(toListResponse(['a', 'b'], { total: 12, page: 2, limit: 25 })).toEqual({
      items: ['a', 'b'],
      total: 12,
      page: 2,
      limit: 25,
      truncated: false,
    });
  });

  it('meta et troncature transmises quand elles sont données', () => {
    const list = toListResponse([1], { total: 1, page: 1, limit: 25, truncated: true, meta: { openCount: 4 } });
    expect(list).toEqual({ items: [1], total: 1, page: 1, limit: 25, truncated: true, meta: { openCount: 4 } });
  });

  it('ne recopie pas le tableau reçu par référence', () => {
    const items = ['a'];
    expect(toListResponse(items, { total: 1, page: 1, limit: 25 }).items).not.toBe(items);
  });
});

describe('toFullListResponse (petits référentiels, toujours complets)', () => {
  it('page 1, limit = total, jamais tronquée', () => {
    expect(toFullListResponse(['x', 'y', 'z'])).toEqual({ items: ['x', 'y', 'z'], total: 3, page: 1, limit: 3, truncated: false });
  });

  it('accepte une meta', () => {
    expect(toFullListResponse([], { activeCount: 0 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      truncated: false,
      meta: { activeCount: 0 },
    });
  });
});

describe('validation hors pipe', () => {
  it('PaginationQueryDto se valide aussi avec class-validator seul', async () => {
    const errors = await validate(plainToInstance(PaginationQueryDto, { page: '2', limit: '25' }));
    expect(errors).toEqual([]);
  });
});
