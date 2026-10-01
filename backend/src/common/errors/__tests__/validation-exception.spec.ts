import { Type } from 'class-transformer';
import { IsInt, IsString, Min, ValidateNested, validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AppException } from '../app-exception';
import { validationException } from '../validation-exception';

class LineDto {
  @IsString()
  serialNumber!: string;
}

class BodyDto {
  @IsInt()
  @Min(1)
  page!: number;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

async function errorsFor(body: object) {
  return validate(plainToInstance(BodyDto, body));
}

describe('validationException — erreurs du ValidationPipe', () => {
  it('400 validation_failed, un détail par champ avec son chemin complet', async () => {
    const error = validationException(await errorsFor({ page: 0, lines: [{ serialNumber: 'SN-1' }, { serialNumber: 4 }] }));

    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe('validation_failed');
    expect(error.details).toEqual({
      errors: [
        { field: 'page', messages: ['page must not be less than 1'] },
        { field: 'lines.1.serialNumber', messages: ['serialNumber must be a string'] },
      ],
    });
  });

  it('message : tous les textes réunis par « — », comme l’écran les affichait', async () => {
    const error = validationException(await errorsFor({ page: 'a', lines: [] }));
    expect(error.message).toBe('page must not be less than 1 — page must be an integer number');
  });

  it('message de repli si aucune contrainte n’est décrite', () => {
    const error = validationException([]);
    expect(error.message).toBe('Les données envoyées sont invalides.');
    expect(error.details).toEqual({ errors: [] });
  });
});
