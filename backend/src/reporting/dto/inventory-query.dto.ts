import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EquipmentCategory } from '@prisma/client';
import { EquipmentSituation, SITUATION_ORDER } from '../../common/bon-predicates';

/** Champs de tri supportés par GET /reporting/inventory (et son export CSV) —
 *  liste blanche stricte : toute autre valeur est refusée (400). Une colonne
 *  du tableau = un champ ; la traduction en `orderBy` Prisma est dans
 *  inventory-sort.ts. */
export const INVENTORY_SORT_FIELDS = [
  'label',
  'category',
  'serialNumber',
  'filiale',
  'collaborateur',
  'situation',
  'dateMiseDisposition',
  'dateRestitution',
] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

/** Sens de tri appliqué au champ `sort` — indépendant du champ pour que
 *  chaque colonne du tableau puisse être triée dans les deux sens. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Accepte les graphies usuelles des booléens en query string : '1', 'true'
 *  (indépendamment de la casse), ou un booléen réel — même convention que
 *  QueryBonsDto.overdue. Exportée pour être réutilisée telle quelle par
 *  InventoryByCollaborateurQueryDto (voir inventory-by-collaborateur-query.dto.ts). */
export const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return value;
};

/** Recadre une chaîne de recherche — exportée pour la même raison que `toBoolean`. */
export const trimSearch = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Filtre sur l'état du compte du collaborateur (`User.active`) — porté
 *  uniquement par `InventoryByCollaborateurQueryDto` (cf. plus bas) : filtrer
 *  la vue par équipement sur ce critère n'a pas d'usage identifié pour
 *  l'instant. Déclaré ici (fichier « base ») pour éviter un cycle d'import
 *  avec inventory-by-collaborateur-query.dto.ts, qui importe déjà de ce
 *  fichier (toBoolean, trimSearch). */
export const COMPTE_FILTER_VALUES = ['actif', 'inactif'] as const;
export type CompteFilter = (typeof COMPTE_FILTER_VALUES)[number];

/**
 * Champs de filtrage communs à `GET /reporting/inventory` et
 * `GET /reporting/inventory/by-collaborateur` : c'est le contrat implicite de
 * `InventoryService.buildWhere`, qui n'en lit jamais d'autres. Les deux DTOs
 * (`InventoryQueryDto` ci-dessous et `InventoryByCollaborateurQueryDto`)
 * implémentent cette interface, ce qui permet à `buildWhere` de rester
 * strictement typé sans dépendre d'un DTO en particulier — et donc d'être
 * appelé sans duplication depuis les deux routes.
 */
export interface InventoryWhereFilters {
  filialeId?: string;
  category?: EquipmentCategory;
  collaborateurId?: string;
  situation?: EquipmentSituation;
  overdue?: boolean;
  search?: string;
  /** cf. COMPTE_FILTER_VALUES — seule InventoryByCollaborateurQueryDto le déclare. */
  compte?: CompteFilter;
  /** Qualité des données : matériel sans numéro de série (NULL ou vide). */
  sansNumeroSerie?: boolean;
}

/** Query DTO commun à la liste paginée et à l'export CSV de l'inventaire du
 *  parc en circulation (mêmes filtres, cf. InventoryService.buildWhere). */
export class InventoryQueryDto implements InventoryWhereFilters {
  @IsOptional()
  @IsUUID()
  filialeId?: string;

  @IsOptional()
  @IsIn(Object.values(EquipmentCategory))
  category?: EquipmentCategory;

  @IsOptional()
  @IsUUID()
  collaborateurId?: string;

  /** Filtre optionnel sur la situation de l'équipement (cf. bon-predicates.ts) —
   *  en_attente_signature / en_circulation / en_litige. */
  @IsOptional()
  @IsIn(SITUATION_ORDER)
  situation?: EquipmentSituation;

  /** Filtre « en retard de restitution » (dateRestitution < aujourd'hui,
   *  Europe/Paris) — indépendant de `situation` : un équipement en_circulation
   *  ou en_litige peut être en retard. Alimente la tuile cliquable « En retard
   *  de restitution » de l'inventaire. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  /** Qualité des données : équipements sans numéro de série — ceux qu'on ne
   *  pourra jamais retracer (page /materiel) ni rapprocher d'un autre outil
   *  (rapprochement GLPI envisagé). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  sansNumeroSerie?: boolean;

  @IsOptional()
  @IsString()
  @Transform(trimSearch)
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
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(INVENTORY_SORT_FIELDS)
  sort?: InventorySortField;

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction?: SortDirection;
}
