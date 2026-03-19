import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(options?: { filialeId?: string; role?: string }) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        filialeId: options?.filialeId,
        role: options?.role as any,
      },
      include: { filiale: true },
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
      include: { filiale: true },
      take: 15,
      orderBy: { displayName: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { filiale: true },
    });
  }
}
