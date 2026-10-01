import { IsIn, IsOptional } from 'class-validator';
import type { FilialesExportStatus } from '../../contracts/filiales';

const STATUSES: readonly FilialesExportStatus[] = ['active', 'all'];

/**
 * GET /filiales/export?images=1&status=active — mêmes filiales que l'écran :
 *  - `images=1` : logos et cachets encodés en base64 dans le fichier ;
 *  - `status` : `active` (filiales actives seulement, ce qu'affiche l'écran
 *    par défaut) ou `all` (défaut : désactivées comprises).
 */
export class FilialesExportQueryDto {
  @IsOptional()
  @IsIn(['0', '1'], { message: 'images doit valoir 0 ou 1' })
  images?: '0' | '1';

  @IsOptional()
  @IsIn(STATUSES, { message: `status doit valoir ${STATUSES.join(', ')}` })
  status: FilialesExportStatus = 'all';
}
