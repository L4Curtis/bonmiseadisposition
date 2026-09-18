import {
  IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Compagnons de chantier (et autres personnes sans compte Active Directory) :
// prénom/nom sont les seules données réellement obligatoires. 60 caractères
// couvre très largement un nom de famille composé tout en restant cohérent
// avec la mise en page du PDF du bon (comme BRAND_MODEL_MAX_LENGTH côté
// catalogue).
export const MANUAL_USER_NAME_MAX_LENGTH = 60;

/** Trim d'une chaîne fournie par le client, appliqué avant la validation
 *  (`transform: true` sur le ValidationPipe global) — une valeur uniquement
 *  composée d'espaces échoue donc sur `@IsNotEmpty()` plutôt que d'être
 *  acceptée telle quelle. */
function trimTransform({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateManualUserDto {
  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le prénom est obligatoire.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le prénom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  firstName!: string;

  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le nom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  lastName!: string;

  // Facultatif : un compagnon de chantier n'a en général pas d'adresse
  // professionnelle. Une chaîne vide envoyée par le formulaire (champ laissé
  // libre) est traitée comme "pas d'email" plutôt que rejetée par @IsEmail().
  @ValidateIf((dto: CreateManualUserDto) => dto.email !== undefined && dto.email !== '')
  @Transform(trimTransform)
  @IsEmail({}, { message: 'Email invalide.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  department?: string;

  @IsOptional()
  @IsUUID('4', { message: 'filialeId doit être un UUID valide.' })
  filialeId?: string;
}

export class UpdateManualUserDto {
  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le prénom ne peut pas être vide.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le prénom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le nom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  lastName?: string;

  // Absent -> email inchangé. Chaîne vide '' -> email vidé (mis à null) : la
  // seule façon de retirer un email déjà saisi. Non-vide -> revalidé/normalisé
  // comme à la création.
  @ValidateIf((dto: UpdateManualUserDto) => dto.email !== undefined && dto.email !== '')
  @Transform(trimTransform)
  @IsEmail({}, { message: 'Email invalide.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(trimTransform)
  department?: string;

  @IsOptional()
  @IsUUID('4', { message: 'filialeId doit être un UUID valide.' })
  filialeId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
