import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const Q_MESSAGE = 'Le numéro recherché ne doit pas dépasser 200 caractères';

/** GET /equipment/history?q=&page=&limit= — une page de l'historique. `q` :
 *  n° de série OU n° d'inventaire, comparé sans tenir compte de la casse ;
 *  vide ou absent, aucune ligne. */
export class EquipmentHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: Q_MESSAGE })
  q?: string;
}

/** GET /equipment/history/export?q= — tout l'historique, sans pagination. */
export class EquipmentHistoryExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: Q_MESSAGE })
  q?: string;
}
