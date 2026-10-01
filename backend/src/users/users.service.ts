import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { toFullListResponse, toListResponse, toPrismaPage } from '../common/pagination';
import { IT_ROLES } from '../common/roles';
import type { ListResponse } from '../contracts/common';
import type { UserOrigin, UserStatusFilter } from '../contracts/users';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import { CreateManualUserDto, UpdateManualUserDto } from './dto/manual-user.dto';
import { ImportManualUsersDto, ImportManualUsersResult } from './dto/import-users.dto';
import { UsersListQueryDto } from './dto/users-list-query.dto';
import { buildManualUsersExportCsv, buildManualUsersImportTemplateCsv } from './users-csv';
import { importManualUsers } from './users-import';
import { USER_SAFE_SELECT } from './user-select';
import {
  buildManualDisplayName,
  buildManualSamAccountBase,
  generateUniqueManualSamAccountName,
  splitManualDisplayName,
} from './manual-account.util';

/** Nombre maximal de personnes proposées par la recherche d'un destinataire. */
const SEARCH_LIMIT = 15;

const EMAIL_TAKEN_MESSAGE = 'Un utilisateur avec cet email existe déjà.';

type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>;

function statusWhere(status: UserStatusFilter): Prisma.UserWhereInput {
  if (status === 'all') return {};
  return { active: status === 'active' };
}

/** Même partage que `accountKind` (user-accounts.service.ts) : un compte
 *  manuel prime, puis un compte local ; le reste vient de l'annuaire. */
function originWhere(origin: UserOrigin | undefined): Prisma.UserWhereInput {
  if (origin === 'manual') return { isManualAccount: true };
  if (origin === 'local') return { isManualAccount: false, isLocalAccount: true };
  if (origin === 'directory') return { isManualAccount: false, isLocalAccount: false };
  return {};
}

function searchWhere(term: string | undefined): Prisma.UserWhereInput {
  if (!term) return {};
  const contains = { contains: term, mode: 'insensitive' as const };
  return { OR: [{ displayName: contains }, { email: contains }, { samAccountName: contains }] };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** GET /users — page de l'écran Utilisateurs, triée par nom. */
  async findPage(query: UsersListQueryDto): Promise<ListResponse<SafeUser>> {
    const where: Prisma.UserWhereInput = {
      ...statusWhere(query.status),
      ...originWhere(query.origin),
      ...(query.role ? { role: query.role } : {}),
      ...(query.filialeId ? { filialeId: query.filialeId } : {}),
      ...searchWhere(query.search),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        ...toPrismaPage(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return toListResponse(items, { total, page: query.page, limit: query.limit });
  }

  /** GET /users/search?q= — personnes actives dont le nom, l'email ou
   *  l'identifiant contient `q` (destinataire d'un bon), SEARCH_LIMIT au plus ;
   *  `truncated` signale qu'il y en a davantage. */
  async search(query: string): Promise<ListResponse<SafeUser>> {
    const where: Prisma.UserWhereInput = { active: true, ...searchWhere(query.trim()) };
    const rows = await this.prisma.user.findMany({
      where,
      select: USER_SAFE_SELECT,
      take: SEARCH_LIMIT + 1,
      orderBy: { displayName: 'asc' },
    });
    const items = rows.slice(0, SEARCH_LIMIT);
    return toListResponse(items, { total: items.length, page: 1, limit: SEARCH_LIMIT, truncated: rows.length > SEARCH_LIMIT });
  }

  /** Administrateurs et techniciens actifs (qui peuvent créer un bon), pour
   *  le filtre « Créé par » de la liste des bons. Sélection par RÔLE, pas par
   *  `isItStaff`, et réduite à ce que le filtre affiche. */
  async findItStaff(): Promise<ListResponse<{ id: string; displayName: string }>> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [...IT_ROLES] }, active: true },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
    return toFullListResponse(staff);
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
  }

  /**
   * POST /users/manual — création d'une fiche pour une personne sans compte
   * Active Directory (compagnon de chantier). Ne créent jamais qu'un
   * collaborateur non-IT, ni AD ni compte local authentifiable : passwordHash
   * reste null, isLocalAccount reste false, la personne signera en présentiel
   * sur la tablette du technicien.
   */
  async createManual(dto: CreateManualUserDto, actorId: string) {
    const firstName = dto.firstName;
    const lastName = dto.lastName;
    // Le DTO transforme un email absent/blanc en '' (ValidateIf le laisse
    // passer sans le valider) : traité comme "pas d'email" à la création.
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const department = dto.department ? dto.department : null;

    if (email) {
      await this.assertEmailAvailable(email);
    }
    if (dto.filialeId) {
      await this.assertFilialeActive(dto.filialeId);
    }

    const displayName = buildManualDisplayName(firstName, lastName);
    const samAccountName = await generateUniqueManualSamAccountName(
      buildManualSamAccountBase(firstName, lastName),
      (candidate) => this.samAccountNameTaken(candidate),
    );

    let created;
    try {
      created = await this.prisma.user.create({
        data: {
          samAccountName,
          displayName,
          email,
          department,
          filialeId: dto.filialeId ?? null,
          role: 'collaborator',
          isItStaff: false,
          active: true,
          isManualAccount: true,
          isLocalAccount: false,
          passwordHash: null,
          lastLdapSync: null,
        },
        select: USER_SAFE_SELECT,
      });
    } catch (err: unknown) {
      // Filet de sécurité contre une collision concurrente (deux créations
      // simultanées pour le même email ou — bien plus improbable — le même
      // samAccountName généré) survenue entre la vérification et l'écriture.
      throw this.toEmailTakenOnUniqueViolation(err);
    }

    await this.audit.recordSafely('user_created_manually', {
      actorId,
      details: { targetUserId: created.id, samAccountName: created.samAccountName, displayName: created.displayName },
    });

    return created;
  }

  /**
   * PATCH /users/:id/manual — modification d'un compte manuel UNIQUEMENT
   * (jamais un compte d'annuaire, synchronisé AD ou provisionné par SSO : ces
   * comptes ne se modifient que dans Active Directory / Entra ID).
   */
  async updateManual(id: string, dto: UpdateManualUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!existing.isManualAccount) {
      throw new AppException(
        'directory_account',
        "Ce compte provient de l'annuaire (Active Directory / SSO) : il ne peut être modifié que dans Active Directory.",
      );
    }

    const data: Prisma.UserUpdateInput = {};
    const changedFields: string[] = [];

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const current = splitManualDisplayName(existing.displayName);
      const firstName = dto.firstName ?? current.firstName;
      const lastName = dto.lastName ?? current.lastName;
      data.displayName = buildManualDisplayName(firstName, lastName);
      if (dto.firstName !== undefined) changedFields.push('firstName');
      if (dto.lastName !== undefined) changedFields.push('lastName');
    }

    if (dto.email !== undefined) {
      // Chaîne vide = on vide le champ (seule façon de retirer un email déjà
      // saisi) ; sinon revalidé/normalisé comme à la création.
      if (dto.email === '') {
        data.email = null;
      } else {
        const email = normalizeEmail(dto.email);
        await this.assertEmailAvailable(email, id);
        data.email = email;
      }
      changedFields.push('email');
    }

    if (dto.department !== undefined) {
      data.department = dto.department === '' ? null : dto.department;
      changedFields.push('department');
    }

    if (dto.filialeId !== undefined) {
      await this.assertFilialeActive(dto.filialeId);
      data.filiale = { connect: { id: dto.filialeId } };
      changedFields.push('filialeId');
    }

    if (dto.active !== undefined) {
      data.active = dto.active;
      changedFields.push('active');
    }

    if (changedFields.length === 0) {
      return this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
    }

    let updated;
    try {
      updated = await this.prisma.user.update({ where: { id }, data, select: USER_SAFE_SELECT });
    } catch (err: unknown) {
      throw this.toEmailTakenOnUniqueViolation(err);
    }

    await this.audit.recordSafely('user_updated_manually', {
      actorId,
      details: { targetUserId: id, displayName: updated.displayName, changedFields },
    });

    return updated;
  }

  /** GET /users/manual/export — CSV des seuls comptes créés à la main (actifs
   *  et inactifs) : les comptes de l'annuaire ne s'exportent pas ici, ils ne
   *  se gèrent que dans Active Directory. Cf. users-csv.ts. */
  async exportManualCsv(): Promise<string> {
    const users = await this.prisma.user.findMany({
      where: { isManualAccount: true },
      select: {
        samAccountName: true, displayName: true, email: true, department: true, active: true,
        filiale: { select: { name: true } },
      },
      orderBy: { displayName: 'asc' },
    });
    return buildManualUsersExportCsv(users);
  }

  /** GET /users/manual/import/template — modèle CSV avec une ligne de
   *  commentaire rappelant les valeurs acceptées (dont les filiales actives). */
  async getManualImportTemplate(): Promise<string> {
    const filiales = await this.prisma.filiale.findMany({
      where: { active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return buildManualUsersImportTemplateCsv(filiales.map((f) => f.name));
  }

  /** POST /users/manual/import — voir users-import.ts pour le contrat exact. */
  importManual(dto: ImportManualUsersDto, actorId: string): Promise<ImportManualUsersResult> {
    return importManualUsers(this.prisma, dto.items, actorId);
  }

  private async samAccountNameTaken(candidate: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({ where: { samAccountName: candidate } });
    return existing !== null;
  }

  private async assertEmailAvailable(email: string, excludeUserId?: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    });
    if (existing) {
      throw new AppException('email_taken', EMAIL_TAKEN_MESSAGE, HttpStatus.CONFLICT);
    }
  }

  private async assertFilialeActive(filialeId: string): Promise<void> {
    const filiale = await this.prisma.filiale.findUnique({ where: { id: filialeId } });
    if (!filiale || !filiale.active) {
      throw new AppException('filiale_unavailable', 'Filiale introuvable ou inactive.');
    }
  }

  private toEmailTakenOnUniqueViolation(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new AppException('email_taken', EMAIL_TAKEN_MESSAGE, HttpStatus.CONFLICT);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
