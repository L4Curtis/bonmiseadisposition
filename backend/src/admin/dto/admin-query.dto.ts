import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** GET /admin/notifications/failed?days= : fenêtre de 1 à 365 jours, 30 par défaut. */
export class FailedNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days doit être un nombre entier de jours' })
  @Min(1, { message: 'days doit valoir au moins 1' })
  @Max(365, { message: 'days doit valoir au plus 365' })
  days: number = 30;
}

/** GET /admin/sso/diagnostic?limit= : de 1 à 50 connexions, 10 par défaut. */
export class SsoDiagnosticQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un nombre entier' })
  @Min(1, { message: 'limit doit valoir au moins 1' })
  @Max(50, { message: 'limit doit valoir au plus 50' })
  limit: number = 10;
}
