import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFilialeDto {
  @IsString()
  name!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  siret?: string;
}

export class UpdateFilialeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  siret?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
