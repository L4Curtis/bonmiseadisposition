import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportFilialesDto } from '../dto/filiale.dto';

/** POST /filiales/import est plafonné à 200 lignes (@ArrayMaxSize) — le
 *  ValidationPipe global du contrôleur applique cette même validation et
 *  répond 400 avant même d'atteindre FilialesService. */
describe('ImportFilialesDto — limite de 200 lignes', () => {
  it('rejects a payload of more than 200 items with a clear 400 message', async () => {
    const dto = plainToInstance(ImportFilialesDto, {
      items: Array.from({ length: 201 }, (_, i) => ({ name: `Filiale ${i}` })),
    });

    const violations = await validate(dto);

    expect(violations.length).toBeGreaterThan(0);
    const messages = violations.flatMap((v) => Object.values(v.constraints ?? {})).join(' ');
    expect(messages).toContain('200');
  });

  it('accepts exactly 200 items without a size violation', async () => {
    const dto = plainToInstance(ImportFilialesDto, {
      items: Array.from({ length: 200 }, (_, i) => ({ name: `Filiale ${i}` })),
    });

    const violations = await validate(dto);

    expect(violations).toHaveLength(0);
  });
});
