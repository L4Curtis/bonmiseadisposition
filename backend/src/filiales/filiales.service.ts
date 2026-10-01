import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Filiale, Prisma } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuditAction } from '../audit/audit-actions';
import { AppException } from '../common/errors';
import { toFullListResponse } from '../common/pagination';
import { dataPath } from '../common/storage-paths';
import type { ListResponse } from '../contracts/common';
import { CreateFilialeDto, UpdateFilialeDto, ImportFilialesDto, ImportFilialesResult } from './dto/filiale.dto';
import { buildFilialesExportCsv, buildFilialesImportTemplateCsv } from './filiales-csv';
import { importFilialeItems } from './filiales-import';
import { filialeChangeActions, filialeIdentity } from './filiales-audit';

/** Administrateur qui agit sur une filiale, et l'adresse d'où il agit. */
export interface FilialeActor {
  readonly id: string;
  readonly ip?: string;
}

type FilialeSummary = Pick<Filiale, 'id' | 'name' | 'displayName' | 'active'>;

@Injectable()
export class FilialesService {
  private readonly logger = new Logger(FilialesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** GET /filiales — toutes les filiales, actives et désactivées. */
  async findAll(): Promise<ListResponse<Filiale>> {
    return toFullListResponse(await this.prisma.filiale.findMany({ orderBy: { displayName: 'asc' } }));
  }

  /** Filiales actives, réduites à leur identité : c'est tout ce qu'utilisent
   *  les filtres et formulaires de l'IT et de la direction (GET
   *  /filiales/active). Cachet, logo, adresse et SIRET restent dans la liste
   *  complète, réservée à l'administrateur. */
  async findActive(): Promise<ListResponse<FilialeSummary>> {
    const filiales = await this.prisma.filiale.findMany({
      where: { active: true },
      select: { id: true, name: true, displayName: true, active: true },
      orderBy: { displayName: 'asc' },
    });
    return toFullListResponse(filiales);
  }

  async findOne(id: string): Promise<Filiale> {
    const filiale = await this.prisma.filiale.findUnique({ where: { id } });
    if (!filiale) throw new NotFoundException('Filiale introuvable');
    return filiale;
  }

  async create(dto: CreateFilialeDto, actor: FilialeActor): Promise<Filiale> {
    const created = await this.prisma.filiale.create({ data: dto }).catch(rethrowNameTaken);
    await this.trace('filiale_created', actor, filialeIdentity(created));
    return created;
  }

  /** PUT /filiales/:id — fiche, désactivation et réactivation. */
  async update(id: string, dto: UpdateFilialeDto, actor: FilialeActor): Promise<Filiale> {
    const before = await this.findOne(id);
    const updated = await this.prisma.filiale.update({ where: { id }, data: dto }).catch(rethrowNameTaken);
    for (const entry of filialeChangeActions(before, dto)) {
      // eslint-disable-next-line no-await-in-loop -- deux entrées au plus, dans l'ordre
      await this.trace(entry.action, actor, entry.details);
    }
    return updated;
  }

  /** Remplace le logo. L'ancien fichier n'est supprimé qu'une fois la
   *  nouvelle valeur enregistrée : un échec ne laisse jamais la filiale
   *  pointer vers un fichier disparu (même règle pour le cachet). */
  async updateLogo(id: string, filename: string, actor: FilialeActor): Promise<Filiale> {
    const filiale = await this.findOne(id);
    const updated = await this.prisma.filiale.update({ where: { id }, data: { logoPath: `uploads/${filename}` } });
    if (filiale.logoPath) this.deleteFile(filiale.logoPath);
    await this.trace('filiale_logo_updated', actor, { ...filialeIdentity(filiale), replaced: filiale.logoPath !== null });
    return updated;
  }

  async updateStamp(id: string, filename: string, actor: FilialeActor): Promise<Filiale> {
    const filiale = await this.findOne(id);
    const updated = await this.prisma.filiale.update({ where: { id }, data: { stampPath: `uploads/${filename}` } });
    if (filiale.stampPath) this.deleteFile(filiale.stampPath);
    await this.trace('filiale_stamp_updated', actor, { ...filialeIdentity(filiale), replaced: filiale.stampPath !== null });
    return updated;
  }

  /** DELETE /filiales/:id — suppression réelle, refusée (409 `filiale_in_use`)
   *  tant qu'un bon ou un compte y est rattaché : il faut alors la désactiver. */
  async remove(id: string, actor: FilialeActor): Promise<Filiale> {
    const filiale = await this.findOne(id);
    const [bonCount, userCount] = await Promise.all([
      this.prisma.bon.count({ where: { filialeId: id } }),
      this.prisma.user.count({ where: { filialeId: id } }),
    ]);
    if (bonCount > 0 || userCount > 0) {
      throw new AppException(
        'filiale_in_use',
        `Impossible de supprimer : ${bonCount} bon(s) et ${userCount} utilisateur(s) sont rattachés à cette filiale. Désactivez-la plutôt.`,
        HttpStatus.CONFLICT,
        { bonCount, userCount },
      );
    }
    // Les fichiers ne partent qu'une fois la ligne supprimée : une suppression
    // refusée par la base ne laisse pas une filiale sans logo ni cachet.
    const deleted = await this.prisma.filiale.delete({ where: { id } });
    if (filiale.logoPath) this.deleteFile(filiale.logoPath);
    if (filiale.stampPath) this.deleteFile(filiale.stampPath);
    await this.trace('filiale_deleted', actor, filialeIdentity(filiale));
    return deleted;
  }

  /** Trace une action sur une filiale, sans jamais faire échouer l'action. */
  private trace(action: AuditAction, actor: FilialeActor, details: Prisma.InputJsonObject): Promise<void> {
    return this.audit.recordSafely(action, { actorId: actor.id, details, ip: actor.ip });
  }

  /** Supprime un logo ou un cachet remplacé (chemin relatif à data/). Un
   *  chemin qui sortirait de data/ (valeur anormale en base) n'est jamais
   *  supprimé : on le signale, sans bloquer le remplacement. */
  private deleteFile(relativePath: string) {
    let fullPath: string;
    try {
      fullPath = dataPath(relativePath);
    } catch (err) {
      this.logger.warn(`Fichier de filiale non supprimé : ${(err as Error).message}`);
      return;
    }
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }

  /** GET /filiales/export — CSV des filiales, actives seulement si
   *  `activeOnly` (logos/cachets en base64 uniquement si `includeImages`,
   *  cf. filiales-csv.ts). */
  async exportCsv(options: { includeImages: boolean; activeOnly: boolean }): Promise<string> {
    const filiales = await this.prisma.filiale.findMany({
      where: options.activeOnly ? { active: true } : {},
      orderBy: { displayName: 'asc' },
    });
    return buildFilialesExportCsv(filiales, options.includeImages);
  }

  /** GET /filiales/import/template — modèle CSV avec deux lignes d'exemple
   *  commentées (cf. filiales-csv.ts). */
  getImportTemplate(): string {
    return buildFilialesImportTemplateCsv();
  }

  /** POST /filiales/import — voir filiales-import.ts pour le détail du
   *  contrat (création / mise à jour / ignoré / erreur par ligne). */
  async importFiliales(dto: ImportFilialesDto, userId: string): Promise<ImportFilialesResult> {
    return importFilialeItems(this.prisma, dto.items, userId);
  }
}

/**
 * Nom déjà pris : l'index unique insensible à la casse sur le nom (migration
 * 20260916100400_unique_constraints, sur lower(name)) refuse le doublon. On
 * le dit (409 `filiale_name_taken`) au lieu d'un 500 Prisma brut ; toute autre
 * erreur est relancée telle quelle.
 */
function rethrowNameTaken(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppException('filiale_name_taken', 'Une filiale avec ce nom existe déjà.', HttpStatus.CONFLICT);
  }
  throw err;
}
