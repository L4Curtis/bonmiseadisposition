import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/types';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import { CreateManualUserDto, UpdateManualUserDto } from './dto/manual-user.dto';
import {
  buildManualDisplayName,
  buildManualSamAccountBase,
  generateUniqueManualSamAccountName,
  splitManualDisplayName,
} from './manual-account.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Fields safe to return in API responses (passwordHash intentionally excluded)
  private readonly safeSelect = {
    id: true,
    samAccountName: true,
    displayName: true,
    email: true,
    department: true,
    company: true,
    title: true,
    filialeId: true,
    filiale: true,
    isItStaff: true,
    role: true,
    isLocalAccount: true,
    isManualAccount: true,
    mustChangePassword: true,
    active: true,
    lastLdapSync: true,
    createdAt: true,
    updatedAt: true,
  };

  findAll(options?: { filialeId?: string; role?: string }) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        filialeId: options?.filialeId,
        role: options?.role as UserRole | undefined,
      },
      select: this.safeSelect,
      orderBy: { displayName: 'asc' },
    });
  }

  /** Pagination optionnelle pour GET /users (LOT C bug #11) : renvoie
   *  { users, total, page, limit } plutôt qu'un tableau brut quand ?page est
   *  fourni — findAll() reste inchangée pour ne pas casser les appelants
   *  existants qui attendent un tableau. */
  async findAllPaginated(options: {
    filialeId?: string;
    role?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const where = {
      active: true,
      filialeId: options.filialeId,
      role: options.role as UserRole | undefined,
      ...(options.search
        ? {
            OR: [
              { displayName: { contains: options.search, mode: 'insensitive' as const } },
              { email: { contains: options.search, mode: 'insensitive' as const } },
              { samAccountName: { contains: options.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.safeSelect,
        orderBy: { displayName: 'asc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page: options.page, limit: options.limit };
  }

  async search(query: string) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { samAccountName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: this.safeSelect,
      take: 15,
      orderBy: { displayName: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect,
    });
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
        select: this.safeSelect,
      });
    } catch (err: unknown) {
      // Filet de sécurité contre une collision concurrente (deux créations
      // simultanées pour le même email ou — bien plus improbable — le même
      // samAccountName généré) survenue entre la vérification et l'écriture.
      throw this.toBadRequestOnUniqueViolation(err);
    }

    await this.writeAudit(actorId, 'user_created_manually', {
      targetUserId: created.id,
      samAccountName: created.samAccountName,
      displayName: created.displayName,
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
      throw new BadRequestException(
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
      return this.prisma.user.findUnique({ where: { id }, select: this.safeSelect });
    }

    let updated;
    try {
      updated = await this.prisma.user.update({ where: { id }, data, select: this.safeSelect });
    } catch (err: unknown) {
      throw this.toBadRequestOnUniqueViolation(err);
    }

    await this.writeAudit(actorId, 'user_updated_manually', {
      targetUserId: id,
      changedFields,
    });

    return updated;
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
      throw new BadRequestException('Un utilisateur avec cet email existe déjà.');
    }
  }

  private async assertFilialeActive(filialeId: string): Promise<void> {
    const filiale = await this.prisma.filiale.findUnique({ where: { id: filialeId } });
    if (!filiale || !filiale.active) {
      throw new BadRequestException('Filiale introuvable ou inactive.');
    }
  }

  private toBadRequestOnUniqueViolation(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new BadRequestException('Un utilisateur avec cet email existe déjà.');
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private async writeAudit(actorId: string, action: string, details: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.auditLog
      .create({ data: { userId: actorId, action, details } })
      .catch((err: unknown) => {
        this.logger.error(`Audit ${action} non journalisé: ${(err as Error).message}`);
      });
  }
}
