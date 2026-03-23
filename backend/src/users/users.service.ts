import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
        role: options?.role as any,
      },
      select: this.safeSelect,
      orderBy: { displayName: 'asc' },
    });
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
