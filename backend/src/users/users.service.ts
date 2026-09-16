import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/types';

@Injectable()
export class UsersService {
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
}
