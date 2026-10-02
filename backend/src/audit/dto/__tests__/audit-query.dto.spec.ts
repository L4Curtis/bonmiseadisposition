import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { validationException } from '../../../common/errors/validation-exception';
import { AppException } from '../../../common/errors/app-exception';
import { AuditQueryDto } from '../audit-query.dto';

/** Même réglage que le pipe global (bootstrap/configure-app.ts). */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationException,
});

function parse(query: Record<string, string>): Promise<AuditQueryDto> {
  const metadata: ArgumentMetadata = { type: 'query', metatype: AuditQueryDto };
  return pipe.transform(query, metadata) as Promise<AuditQueryDto>;
}

describe('AuditQueryDto — pagination du journal, comme les autres listes', () => {
  it('sans paramètre : page 1, 25 lignes', async () => {
    const query = await parse({});
    expect(query.page).toBe(1);
    expect(query.limit).toBe(25);
  });

  it.each(['25', '50', '100'])('accepte %s lignes par page', async (limit) => {
    expect((await parse({ limit, page: '2' })).limit).toBe(Number(limit));
  });

  it.each(['10', '200', '0'])('refuse %s lignes par page (400, jamais corrigé en silence)', async (limit) => {
    await expect(parse({ limit })).rejects.toBeInstanceOf(AppException);
  });
});
