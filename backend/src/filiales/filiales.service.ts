import { Injectable, NotFoundException } from '@nestjs/common';
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

  create(dto: CreateFilialeDto) {
    return this.prisma.filiale.create({ data: dto });
  }

  async update(id: string, dto: UpdateFilialeDto) {
    await this.findOne(id);
    return this.prisma.filiale.update({ where: { id }, data: dto });
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
    if (filiale.logoPath) this.deleteFile(filiale.logoPath);
    if (filiale.stampPath) this.deleteFile(filiale.stampPath);
    return this.prisma.filiale.delete({ where: { id } });
  }

  private deleteFile(relativePath: string) {
    const fullPath = join(process.cwd(), '..', 'data', relativePath);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }
}
