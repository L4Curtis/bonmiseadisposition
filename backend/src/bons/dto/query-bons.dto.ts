import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { BonStatus } from '../../common/types';

/** Accepts "a,b,c" or repeated params and normalizes to an array. */
const toStatusArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

/** Accepts the usual query-string boolean spellings: '1', 'true' (any case), or a real boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

export class QueryBonsDto {
  @IsOptional()
  @Transform(toStatusArray)
  @IsEnum(BonStatus, { each: true, message: 'status contient une valeur de statut inconnue' })
  status?: BonStatus[];

  @IsOptional()
  @Transform(toStatusArray)
  @IsEnum(BonStatus, { each: true, message: 'excludeStatus contient une valeur de statut inconnue' })
  excludeStatus?: BonStatus[];

  @IsOptional()
  @IsUUID()
  filialeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
