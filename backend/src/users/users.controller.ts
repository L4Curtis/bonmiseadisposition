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
  findAll(@Query('filialeId') filialeId?: string, @Query('role') role?: string) {
    if (role && !Object.values(UserRole).includes(role as UserRole)) {
      throw new BadRequestException(`Rôle inconnu : ${role}`);
    }
    return this.usersService.findAll({ filialeId, role });
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
