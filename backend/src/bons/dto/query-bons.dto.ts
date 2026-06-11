import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { BonStatus } from '../../common/types';

/** Accepts "a,b,c" or repeated params and normalizes to an array. */
const toStatusArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').filter(Boolean) : value;

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
