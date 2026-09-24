import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { MANUAL_USER_NAME_MAX_LENGTH } from './manual-user.dto';

// ── Import en masse des collaborateurs manuels (POST /users/manual/import) ──
//
// Même principe que filiales/dto/filiale.dto.ts#ImportFilialesDto :
// `ImportManualUsersDto.items` reste `unknown[]` (pas de `@ValidateNested()`
// global) pour qu'une ligne invalide devienne une entrée du compte rendu SANS
// faire échouer (400) la requête entière — chaque ligne est validée
// manuellement dans users-import.ts via plainToInstance + validate.

/** Nombre maximal de lignes par import — les comptes manuels sont créés par
 *  petits lots (une équipe de chantier, un prestataire) : 500 couvre largement
 *  une reprise initiale tout en gardant un traitement séquentiel court. */
export const IMPORT_MANUAL_USERS_MAX_ITEMS = 500;

const SAM_ACCOUNT_NAME_MAX_LENGTH = 100;
const DEPARTMENT_MAX_LENGTH = 100;
const FILIALE_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;

function trimTransform({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Trim, puis chaîne vide ramenée à `undefined` : dans un import, une cellule
 *  vide signifie « champ non fourni, ne pas modifier » (même convention que
 *  filiales/dto/transforms.ts#trimToUndefinedTransform). */
function trimToUndefinedTransform({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class ImportManualUserItemDto {
  // Clé de rapprochement (cf. users-import.ts) : absente → création,
  // présente → mise à jour du compte manuel portant cet identifiant.
  @IsOptional()
  @IsString({ message: 'identifiant doit être une chaîne.' })
  @Transform(trimToUndefinedTransform)
  @MaxLength(SAM_ACCOUNT_NAME_MAX_LENGTH, { message: `L'identifiant ne doit pas dépasser ${SAM_ACCOUNT_NAME_MAX_LENGTH} caractères.` })
  samAccountName?: string;

  @IsString({ message: 'Le prénom est obligatoire.' })
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le prénom est obligatoire.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le prénom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  firstName!: string;

  @IsString({ message: 'Le nom est obligatoire.' })
  @Transform(trimTransform)
  @IsNotEmpty({ message: 'Le nom est obligatoire.' })
  @MaxLength(MANUAL_USER_NAME_MAX_LENGTH, { message: `Le nom ne doit pas dépasser ${MANUAL_USER_NAME_MAX_LENGTH} caractères.` })
  lastName!: string;

  // Facultatif (c'est le principe de ces comptes) ; s'il est fourni, il doit
  // être valide.
  @IsOptional()
  @IsString({ message: 'Email invalide.' })
  @Transform(trimToUndefinedTransform)
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'Email invalide.' })
  @IsEmail({}, { message: 'Email invalide.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Le service doit être une chaîne.' })
  @Transform(trimToUndefinedTransform)
  @MaxLength(DEPARTMENT_MAX_LENGTH, { message: `Le service ne doit pas dépasser ${DEPARTMENT_MAX_LENGTH} caractères.` })
  department?: string;

  // Nom de la filiale (colonne `filiale` du CSV), résolu côté serveur sans
  // tenir compte de la casse parmi les filiales actives.
  @IsOptional()
  @IsString({ message: 'La filiale doit être une chaîne.' })
  @Transform(trimToUndefinedTransform)
  @MaxLength(FILIALE_NAME_MAX_LENGTH, { message: `Le nom de filiale ne doit pas dépasser ${FILIALE_NAME_MAX_LENGTH} caractères.` })
  filiale?: string;

  @IsOptional()
  @IsBoolean({ message: 'actif doit être un booléen.' })
  active?: boolean;
}

export class ImportManualUsersDto {
  @IsArray({ message: 'items doit être un tableau.' })
  @ArrayMaxSize(IMPORT_MANUAL_USERS_MAX_ITEMS, {
    message: `Un import ne peut pas contenir plus de ${IMPORT_MANUAL_USERS_MAX_ITEMS} collaborateurs.`,
  })
  items!: unknown[];
}

export type ImportLineStatus = 'created' | 'updated' | 'skipped' | 'error';

/** Compte rendu d'une ligne, dans l'ordre du tableau envoyé (`index`). */
export interface ImportManualUserLineResult {
  index: number;
  status: ImportLineStatus;
  samAccountName?: string;
  displayName?: string;
  message?: string;
}

export interface ImportManualUsersResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
  lines: ImportManualUserLineResult[];
}
