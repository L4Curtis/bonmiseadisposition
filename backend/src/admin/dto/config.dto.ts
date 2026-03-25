import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class SetConfigDto {
  @IsString()
  value!: string;

  @IsOptional()
  @IsBoolean()
  encrypted?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BulkSetConfigDto {
  @IsString({ each: true })
  keys!: string[];

  values!: Record<string, string>;

  encryptedKeys?: string[];
}

export class BulkConfigValuesDto {
  [key: string]: string;
}
