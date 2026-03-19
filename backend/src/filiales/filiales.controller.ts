import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  UseGuards, UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { join } from 'path';
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

  // Serve uploaded files
  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    return res.sendFile(join(process.cwd(), '..', 'data', 'uploads', filename));
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
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.filialesService.updateLogo(id, file.filename);
  }

  @Patch(':id/stamp')
  @UseGuards(RolesGuard)
  @Roles('admin', 'technician')
  @UseInterceptors(FileInterceptor('file'))
  uploadStamp(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.filialesService.updateStamp(id, file.filename);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.filialesService.remove(id);
  }
}
