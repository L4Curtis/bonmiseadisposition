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

/**
 * DTO pour les mises à jour bulk de configuration.
 * Les clés dynamiques sont validées manuellement dans le controller
 * (ALLOWED_CONFIG_KEYS) — on désactive la whitelist ici.
 */
export class BulkConfigValuesDto {
  [key: string]: string;
}
