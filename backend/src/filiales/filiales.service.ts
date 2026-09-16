import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFilialeDto, UpdateFilialeDto } from './dto/filiale.dto';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

@Injectable()
export class FilialesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.filiale.findMany({ orderBy: { displayName: 'asc' } });
  }

  findActive() {
    return this.prisma.filiale.findMany({ where: { active: true }, orderBy: { displayName: 'asc' } });
  }

  async findOne(id: string) {
    const filiale = await this.prisma.filiale.findUnique({ where: { id } });
    if (!filiale) throw new NotFoundException('Filiale introuvable');
    return filiale;
  }

  async create(dto: CreateFilialeDto) {
    try {
      return await this.prisma.filiale.create({ data: dto });
    } catch (err) {
      throw this.toBadRequestOnUniqueNameViolation(err);
    }
  }

  async update(id: string, dto: UpdateFilialeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.filiale.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.toBadRequestOnUniqueNameViolation(err);
    }
  }

  /**
   * Traduit la violation de l'index unique insensible à la casse sur le nom
   * (migration 20260916100400_unique_constraints, sur lower(name)) en 400
   * lisible, plutôt que de laisser remonter un 500 Prisma brut au client.
   * Toute autre erreur Prisma (panne DB, etc.) est relancée telle quelle.
   */
  private toBadRequestOnUniqueNameViolation(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new BadRequestException('Une filiale avec ce nom existe déjà.');
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  async updateLogo(id: string, filename: string) {
    const filiale = await this.findOne(id);
    if (filiale.logoPath) this.deleteFile(filiale.logoPath);
    return this.prisma.filiale.update({
      where: { id },
      data: { logoPath: `uploads/${filename}` },
    });
  }

  async updateStamp(id: string, filename: string) {
    const filiale = await this.findOne(id);
    if (filiale.stampPath) this.deleteFile(filiale.stampPath);
    return this.prisma.filiale.update({
      where: { id },
      data: { stampPath: `uploads/${filename}` },
    });
  }

  async remove(id: string) {
    const filiale = await this.findOne(id);
    // Check for existing references before hard-delete
    const bonCount = await this.prisma.bon.count({ where: { filialeId: id } });
    const userCount = await this.prisma.user.count({ where: { filialeId: id } });
    if (bonCount > 0 || userCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${bonCount} bon(s) et ${userCount} utilisateur(s) sont rattachés à cette filiale. Désactivez-la plutôt.`,
      );
    }
    if (filiale.logoPath) this.deleteFile(filiale.logoPath);
    if (filiale.stampPath) this.deleteFile(filiale.stampPath);
    return this.prisma.filiale.delete({ where: { id } });
  }

  private deleteFile(relativePath: string) {
    const fullPath = join(process.cwd(), 'data', relativePath);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }
}
