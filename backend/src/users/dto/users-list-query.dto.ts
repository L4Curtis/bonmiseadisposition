import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination';
import type { UserOrigin, UserStatusFilter } from '../../contracts/users';

const ROLES = Object.values(UserRole);
const STATUSES: readonly UserStatusFilter[] = ['active', 'inactive', 'all'];
const ORIGINS: readonly UserOrigin[] = ['manual', 'local', 'directory'];

/** Texte de recherche : espaces retirés, vide = pas de recherche. */
function trimmed({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

/**
 * GET /users — page de l'écran Utilisateurs (administrateur) :
 *  - `search` : fragment du nom, de l'email ou de l'identifiant ;
 *  - `status` : comptes actifs (défaut), inactifs, ou tous ;
 *  - `origin` : comptes créés à la main, locaux ou venus de l'annuaire ;
 *  - `role`, `filialeId` : filtres exacts.
 */
export class UsersListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100, { message: 'La recherche ne doit pas dépasser 100 caractères' })
  search?: string;

  @IsOptional()
  @IsIn(STATUSES, { message: `status doit valoir ${STATUSES.join(', ')}` })
  status: UserStatusFilter = 'active';

  @IsOptional()
  @IsIn(ORIGINS, { message: `origin doit valoir ${ORIGINS.join(', ')}` })
  origin?: UserOrigin;

  @IsOptional()
  @IsIn(ROLES, { message: `Rôle inconnu : valeurs admises ${ROLES.join(', ')}` })
  role?: UserRole;

  @IsOptional()
  @IsUUID('all', { message: 'filialeId doit être un identifiant de filiale' })
  filialeId?: string;
}
