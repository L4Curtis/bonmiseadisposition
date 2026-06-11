import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  UseGuards, UseInterceptors, UploadedFile, Res, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { FilialesService } from './filiales.service';
import { CreateFilialeDto, UpdateFilialeDto } from './dto/filiale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('filiales')
@UseGuards(JwtAuthGuard)
export class FilialesController {
  constructor(private readonly filialesService: FilialesService) {}

  @Get()
  findAll() {
    return this.filialesService.findAll();
  }

  @Get('active')
  findActive() {
    return this.filialesService.findActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filialesService.findOne(id);
  }

  // Serve uploaded files (sanitized to prevent path traversal)
  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const safe = basename(filename);
    const fullPath = join(process.cwd(), 'data', 'uploads', safe);
    if (!existsSync(fullPath)) {
      return res.status(404).json({ message: 'Fichier introuvable' });
    }
    // Force download for SVG files to prevent stored XSS
    if (/\.svg$/i.test(safe)) {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Type', 'text/plain');
    }
    return res.sendFile(fullPath);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  create(@Body() dto: CreateFilialeDto) {
    return this.filialesService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  update(@Param('id') id: string, @Body() dto: UpdateFilialeDto) {
    return this.filialesService.update(id, dto);
  }

  @Patch(':id/logo')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.filialesService.updateLogo(id, file.filename);
  }

  @Patch(':id/stamp')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadStamp(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.filialesService.updateStamp(id, file.filename);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.filialesService.remove(id);
  }
}
