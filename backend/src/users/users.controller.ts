import {
  Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UsersService } from './users.service';
import { UserAccountsService } from './user-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { sendCsv } from '../common/csv';
import { clientIp } from '../common/http/client-ip';
import { DeprecatedAlias } from '../common/http/deprecated-alias';
import type { UserPageMeta } from '../contracts/users';
import type { ListResponse } from '../contracts/common';
import { CreateManualUserDto, UpdateManualUserDto } from './dto/manual-user.dto';
import { ImportManualUsersDto } from './dto/import-users.dto';
import { UsersListQueryDto } from './dto/users-list-query.dto';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';

/**
 * Utilisateurs. La GESTION des comptes (liste de l'écran Utilisateurs, comptes
 * manuels, import/export, rôle, déverrouillage, désactivation) est réservée à
 * l'administrateur : c'est le rôle posé sur la classe. Le technicien garde les
 * lectures dont il a besoin pour travailler sur les bons, ouvertes route par
 * route : `search` (destinataire d'un bon), `it-staff` (filtre « Créé par » de
 * la liste des bons) et `:id` (fiche d'une personne, en lecture).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accounts: UserAccountsService,
  ) {}

  /** GET /users — page de l'écran Utilisateurs. `meta.directoryActive` dit
   *  si l'annuaire synchronise les comptes : sinon, l'écran propose de
   *  désactiver un compte venu d'Active Directory. */
  @Get()
  async findPage(@Query() query: UsersListQueryDto): Promise<ListResponse<unknown, UserPageMeta>> {
    const [page, directoryActive] = await Promise.all([
      this.usersService.findPage(query),
      this.accounts.directoryActive(),
    ]);
    return { ...page, meta: { directoryActive } };
  }

  /** GET /users/search?q= — recherche d'une personne active : destinataire
   *  d'un bon (formulaire de bon). */
  @Get('search')
  @Roles('admin', 'technician')
  search(@Query('q') q: string | undefined) {
    return this.usersService.search(typeof q === 'string' ? q : '');
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
   *  de bon. Routes statiques déclarées avant les routes paramétrées. */
  @Post('manual')
  createManual(@Body() dto: CreateManualUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createManual(dto, user.id);
  }

  /** GET /users/manual/export — CSV (BOM UTF-8, séparateur `;`) des comptes
   *  créés à la main, nommé `collaborateurs-manuels-AAAA-MM-JJ.csv` (date de
   *  Paris) : identifiant;prenom;nom;email;service;filiale;actif. */
  @Get('manual/export')
  async exportManual(@Res() res: Response): Promise<void> {
    sendCsv(res, { filename: 'collaborateurs-manuels', csv: await this.usersService.exportManualCsv() });
  }

  /** GET /users/manual/import/template — même en-tête que l'export, plus une
   *  ligne de commentaire des valeurs acceptées et une ligne d'exemple. */
  @Get('manual/import/template')
  async importManualTemplate(@Res() res: Response): Promise<void> {
    const csv = await this.usersService.getManualImportTemplate();
    sendCsv(res, { filename: 'modele-import-collaborateurs', csv, dated: false });
  }

  /** POST /users/manual/import — import en masse (max 500 lignes) des
   *  collaborateurs créés à la main : cf. users-import.ts pour le contrat. */
  @Post('manual/import')
  importManual(@Body() dto: ImportManualUsersDto, @CurrentUser() user: AuthUser) {
    return this.usersService.importManual(dto, user.id);
  }

  /** PATCH /users/:id/manual — modification d'un compte manuel uniquement
   *  (refusée en 400 `directory_account` pour un compte d'annuaire). */
  @Patch(':id/manual')
  updateManual(@Param('id') id: string, @Body() dto: UpdateManualUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.updateManual(id, dto, user.id);
  }

  /** PATCH /users/:id/role — changement de rôle. */
  @Patch(':id/role')
  @DeprecatedAlias('PATCH /admin/users/:id/role')
  changeRole(@Param('id') id: string, @Body() dto: ChangeUserRoleDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.accounts.changeRole(id, dto.role, user, clientIp(req));
  }

  /** POST /users/:id/unlock — lève le verrou de la connexion locale. */
  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @DeprecatedAlias('POST /admin/users/:id/unlock')
  unlock(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.accounts.unlock(id, user, clientIp(req));
  }

  /** POST /users/:id/deactivate — le compte ne peut plus se connecter ni être
   *  choisi comme destinataire d'un bon. Compte d'annuaire : seulement quand
   *  l'annuaire est inactif (409 `directory_active` sinon). */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.accounts.setActive(id, false, user, clientIp(req));
  }

  /** POST /users/:id/reactivate — rend au compte son accès. */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.accounts.setActive(id, true, user, clientIp(req));
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
