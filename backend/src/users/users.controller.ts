import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { CreateManualUserDto, UpdateManualUserDto } from './dto/manual-user.dto';
import { ImportManualUsersDto } from './dto/import-users.dto';

function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/**
 * Utilisateurs. La GESTION des comptes (liste de l'écran Utilisateurs, comptes
 * manuels, import/export, désactivation) est réservée à l'administrateur :
 * c'est le rôle posé sur la classe. Le technicien garde les lectures dont il a
 * besoin pour travailler sur les bons, ouvertes route par route :
 * `search` (destinataire d'un bon), `it-staff` (filtre « Créé par » de la
 * liste des bons) et `:id` (fiche d'une personne, en lecture).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
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

  /** GET /users/search?q= — recherche d'une personne active : destinataire
   *  d'un bon (formulaire de bon) et recherche de l'écran Utilisateurs. */
  @Get('search')
  @Roles('admin', 'technician')
  search(@Query('q') q: string) {
    return this.usersService.search(q || '');
  }

  /** GET /users/it-staff — administrateurs et techniciens actifs, réduits à
   *  `{ id, displayName }` : alimente le filtre « Créé par » de la liste des
   *  bons sans ouvrir au technicien la liste de gestion des comptes. */
  @Get('it-staff')
  @Roles('admin', 'technician')
  findItStaff() {
    return this.usersService.findItStaff();
  }

  /** POST /users/manual — création d'une fiche pour une personne sans compte
   *  Active Directory (compagnon de chantier), y compris depuis le formulaire
   *  de bon. Déclarée avant `:id` par convention (routes statiques avant
   *  routes paramétrées), bien que POST ne puisse pas collisionner avec les
   *  GET ci-dessus. */
  @Post('manual')
  createManual(@Body() dto: CreateManualUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createManual(dto, user.id);
  }

  /** GET /users/manual/export — CSV (BOM UTF-8, séparateur `;`) des
   *  collaborateurs créés à la main :
   *  identifiant;prenom;nom;email;service;filiale;actif (cf. users-csv.ts). */
  @Get('manual/export')
  async exportManual(@Res() res: Response) {
    const csv = await this.usersService.exportManualCsv();
    sendCsv(res, `collaborateurs-manuels-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  /** GET /users/manual/import/template — même en-tête que l'export, plus une
   *  ligne de commentaire des valeurs acceptées et une ligne d'exemple. */
  @Get('manual/import/template')
  async importManualTemplate(@Res() res: Response) {
    const csv = await this.usersService.getManualImportTemplate();
    sendCsv(res, 'modele-import-collaborateurs.csv', csv);
  }

  /** POST /users/manual/import — import en masse (max 500 lignes) des
   *  collaborateurs créés à la main : cf. users-import.ts pour le contrat. */
  @Post('manual/import')
  importManual(@Body() dto: ImportManualUsersDto, @CurrentUser() user: AuthUser) {
    return this.usersService.importManual(dto, user.id);
  }

  /** PATCH /users/:id/manual — modification (ou désactivation) d'un compte
   *  manuel uniquement (rejetée pour un compte d'annuaire par
   *  UsersService.updateManual). */
  @Patch(':id/manual')
  updateManual(
    @Param('id') id: string,
    @Body() dto: UpdateManualUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.updateManual(id, dto, user.id);
  }

  /** GET /users/:id — fiche d'une personne, en lecture pour l'IT. */
  @Get(':id')
  @Roles('admin', 'technician')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }
}
