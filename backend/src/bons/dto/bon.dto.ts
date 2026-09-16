import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  ValidateIf,
  IsInt,
  IsUUID,
  Min,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

// Strict calendar date (the column is @db.Date): a full ISO datetime with a
// timezone offset would be converted to UTC and could shift the date by a day.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_MESSAGE = 'La date doit être au format YYYY-MM-DD';

/**
 * Valide catalogItemId XOR customLabel (non vide) sur un BonEquipmentDto.
 * Posée sur une propriété DÉDIÉE (`equipmentReference`) plutôt que sur
 * catalogItemId/customLabel eux-mêmes : en class-validator, un @IsOptional/
 * @ValidateIf sur une propriété fait sauter TOUS les validateurs de CETTE
 * propriété (le "skip" est décidé par propriété, pas par décorateur) — posé
 * sur catalogItemId, ce contrôle croisé serait donc ignoré dès que
 * catalogItemId est absent, exactement le cas qu'il doit détecter (ni
 * catalogItemId ni customLabel fournis).
 */
@ValidatorConstraint({ name: 'catalogItemXorCustomLabel', async: false })
class CatalogItemXorCustomLabelConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as BonEquipmentDto;
    const hasCatalogItem = typeof obj.catalogItemId === 'string' && obj.catalogItemId.length > 0;
    const hasCustomLabel = typeof obj.customLabel === 'string' && obj.customLabel.trim().length > 0;
    return hasCatalogItem !== hasCustomLabel; // exactement l'un des deux, jamais les deux ni aucun
  }

  defaultMessage(): string {
    return 'Chaque équipement doit référencer un article du catalogue OU indiquer une désignation libre (l\'un des deux, pas les deux)';
  }
}

export class BonEquipmentDto {
  @IsOptional() @IsUUID('4', { message: 'catalogItemId doit être un UUID valide' }) catalogItemId?: string;
  @IsOptional() @IsString() customLabel?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() @Min(0) order?: number;

  /** Champ jamais transmis par le client : ancrage de la validation croisée
   *  catalogItemId XOR customLabel (voir CatalogItemXorCustomLabelConstraint
   *  ci-dessus pour le pourquoi de cet emplacement dédié). */
  @Validate(CatalogItemXorCustomLabelConstraint)
  equipmentReference?: never;
}

export class CreateBonDto {
  @IsUUID('4', { message: 'filialeId doit être un UUID valide' }) filialeId!: string;
  @IsUUID('4', { message: 'collaborateurId doit être un UUID valide' }) collaborateurId!: string;
  @IsEnum(['mme', 'mr']) civilite!: string;
  @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateMiseDisposition!: string;
  @IsOptional() @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateRestitution?: string;
  @IsOptional() @IsString() notes?: string;
  // Pas de @ArrayMinSize(1) : un brouillon vide (0 équipement, ex. créé avant
  // même de choisir le matériel) est autorisé aujourd'hui — bonEquipment est
  // rempli plus tard via update(). La règle « au moins un équipement » n'est
  // imposée qu'au moment d'envoyer le bon (assertSendable, appelée par send()
  // et initiateInPersonSignature('mise_disposition')).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonEquipmentDto)
  equipments?: BonEquipmentDto[];
  @IsOptional() @IsUUID('4', { message: 'packId doit être un UUID valide' }) packId?: string;
}

export class UpdateBonDto {
  @IsOptional() @IsUUID('4', { message: 'filialeId doit être un UUID valide' }) filialeId?: string;
  @IsOptional() @IsUUID('4', { message: 'collaborateurId doit être un UUID valide' }) collaborateurId?: string;
  @IsOptional() @IsEnum(['mme', 'mr']) civilite?: string;
  @IsOptional() @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE }) dateMiseDisposition?: string;
  // null efface explicitement la date de restitution (data.dateRestitution =
  // null côté service) ; undefined = inchangé. @ValidateIf saute le @Matches
  // uniquement pour null — une chaîne fournie doit toujours être YYYY-MM-DD.
  @IsOptional()
  @ValidateIf((o) => o.dateRestitution !== null)
  @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE })
  dateRestitution?: string | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonEquipmentDto)
  equipments?: BonEquipmentDto[];
}
