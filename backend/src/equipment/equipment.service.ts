import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCatalogItemDto, UpdateCatalogItemDto,
  CreatePackDto, UpdatePackDto, ImportCatalogDto, ImportCatalogResult,
} from './dto/equipment.dto';
import { importCatalogItems } from './equipment-catalog-import';
import { getEquipmentHistory, findSerialConflicts } from './equipment-serial';
import { buildEquipmentHistoryCsv } from './equipment-history-csv';
import * as catalog from './equipment-catalog';
import * as packs from './equipment-packs';

/**
 * Façade fine : chaque méthode publique délègue à un module de fonctions
 * pures dédié — `equipment-serial.ts` (historique matériel par n° de série
 * ou d'inventaire, conflits de série), `equipment-history-csv.ts` (export
 * CSV de cet historique), `equipment-catalog.ts` (CRUD catalogue) et
 * `equipment-packs.ts` (CRUD packs), qui reçoivent explicitement `prisma`.
 */
@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Historique matériel (n° de série ou n° d'inventaire) ────

  getEquipmentHistory(reference: string) {
    return getEquipmentHistory(this.prisma, reference);
  }

  /** Export CSV de l'historique (A4) — mêmes entrées que getEquipmentHistory. */
  async getEquipmentHistoryCsv(reference: string) {
    const { items, truncated } = await this.getEquipmentHistory(reference);
    return { csv: buildEquipmentHistoryCsv(items), truncated };
  }

  findSerialConflicts(serials: string[], excludeBonId?: string) {
    return findSerialConflicts(this.prisma, serials, excludeBonId);
  }

  // ── Catalogue ──────────────────────────────────────────────

  findAllCatalog() {
    return catalog.findAllCatalog(this.prisma);
  }

  findActiveCatalog() {
    return catalog.findActiveCatalog(this.prisma);
  }

  searchCatalog(query: string) {
    return catalog.searchCatalog(this.prisma, query);
  }

  findOneCatalog(id: string) {
    return catalog.findOneCatalog(this.prisma, id);
  }

  createCatalogItem(dto: CreateCatalogItemDto, userId: string) {
    return catalog.createCatalogItem(this.prisma, dto, userId);
  }

  updateCatalogItem(id: string, dto: UpdateCatalogItemDto, userId: string) {
    return catalog.updateCatalogItem(this.prisma, id, dto, userId);
  }

  removeCatalogItem(id: string, userId: string) {
    return catalog.removeCatalogItem(this.prisma, id, userId);
  }

  /**
   * Import en masse (POST /equipment/catalog/import) : voir
   * equipment-catalog-import.ts pour le détail du contrat et du comportement
   * (skip / update / create / erreur par ligne, sans jamais interrompre le lot).
   */
  async importCatalog(dto: ImportCatalogDto, userId: string): Promise<ImportCatalogResult> {
    return importCatalogItems(this.prisma, dto.items, userId);
  }

  // ── Packs ──────────────────────────────────────────────────

  findAllPacks() {
    return packs.findAllPacks(this.prisma);
  }

  findActivePacks() {
    return packs.findActivePacks(this.prisma);
  }

  findOnePack(id: string) {
    return packs.findOnePack(this.prisma, id);
  }

  createPack(dto: CreatePackDto, userId: string) {
    return packs.createPack(this.prisma, dto, userId);
  }

  updatePack(id: string, dto: UpdatePackDto, userId: string) {
    return packs.updatePack(this.prisma, id, dto, userId);
  }

  removePack(id: string, userId: string) {
    return packs.removePack(this.prisma, id, userId);
  }
}
