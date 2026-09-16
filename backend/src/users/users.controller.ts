import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'technician')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Query('filialeId') filialeId?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    if (role && !Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException(`Rôle inconnu : ${role}`);
    }

    // Pagination optionnelle : sans ?page, comportement inchangé (tableau
    // complet) pour ne pas casser les appelants existants du front.
    if (page === undefined) {
      return this.usersService.findAll({ filialeId, role });
    }

    const pageNum = Number(page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      throw new BadRequestException('Le paramètre "page" doit être un entier ≥ 1');
    }
    const limitNum = limit !== undefined ? Number(limit) : 20;
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Le paramètre "limit" doit être un entier entre 1 et 100');
    }

    return this.usersService.findAllPaginated({ filialeId, role, search, page: pageNum, limit: limitNum });
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.usersService.search(q || '');
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }
}
