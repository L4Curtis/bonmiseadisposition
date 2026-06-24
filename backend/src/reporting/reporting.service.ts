import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_DAYS = 7;

const CATEGORY_LABELS: Record<string, string> = {
  pc_portable: 'PC portable',
  pc_fixe: 'PC fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Station d’accueil',
  cable: 'Câble',
  autre: 'Autre',
};

/** Reporting léger : parc en circulation, retards de signature, tendance mensuelle. */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [circulating, overdue, monthly] = await Promise.all([
      this.getCirculating(),
      this.getOverdue(),
      this.getMonthly(),
    ]);
    return { circulating, overdue, monthly };
  }

  /** Équipements actuellement sortis (bons actifs / restitution partielle, non rendus). */
  private async getCirculating() {
    const items = await this.prisma.bonEquipment.findMany({
      where: {
        returnedAt: null,
        notReturned: false,
        bon: { status: { in: ['active', 'partially_returned'] } },
      },
      select: {
        customLabel: true,
        catalogItem: { select: { category: true, brand: true, model: true } },
        bon: { select: { id: true, filiale: { select: { displayName: true } } } },
      },
    });

    const byCategory = new Map<string, number>();
    const byFiliale = new Map<string, number>();
    const bonIds = new Set<string>();
    for (const it of items) {
      const cat = it.catalogItem?.category ?? 'autre';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      const fil = it.bon.filiale?.displayName ?? 'Sans filiale';
      byFiliale.set(fil, (byFiliale.get(fil) ?? 0) + 1);
      bonIds.add(it.bon.id);
    }

    return {
      totalEquipments: items.length,
      totalBons: bonIds.size,
      byCategory: [...byCategory.entries()]
        .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category] ?? category, count }))
        .sort((a, b) => b.count - a.count),
      byFiliale: [...byFiliale.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /** Bons en attente de signature depuis plus de OVERDUE_DAYS jours. */
  private async getOverdue() {
    const cutoff = new Date(Date.now() - OVERDUE_DAYS * DAY_MS);
    const bons = await this.prisma.bon.findMany({
      where: {
        status: { in: ['sent_mise_dispo', 'sent_restitution'] },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        reference: true,
        status: true,
        updatedAt: true,
        collaborateur: { select: { displayName: true, email: true, department: true } },
        filiale: { select: { displayName: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });

    const now = Date.now();
    const items = bons.map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      collaborateur: b.collaborateur.displayName,
      email: b.collaborateur.email,
      department: b.collaborateur.department ?? '',
      filiale: b.filiale?.displayName ?? '',
      since: b.updatedAt,
      days: Math.floor((now - new Date(b.updatedAt).getTime()) / DAY_MS),
    }));

    // Agrégat par service (department) pour repérer les zones de friction
    const byDepartment = new Map<string, number>();
    for (const it of items) {
      const dep = it.department || 'Non renseigné';
      byDepartment.set(dep, (byDepartment.get(dep) ?? 0) + 1);
    }

    return {
      count: items.length,
      thresholdDays: OVERDUE_DAYS,
      items,
      byDepartment: [...byDepartment.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /** Bons créés / archivés par mois sur les 12 derniers mois. */
  private async getMonthly() {
    const now = new Date();
    const buckets: { month: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ month: start.toISOString().slice(0, 7), start, end });
    }

    const results = await Promise.all(
      buckets.map(async (b) => {
        const [created, archived] = await Promise.all([
          this.prisma.bon.count({ where: { createdAt: { gte: b.start, lt: b.end } } }),
          this.prisma.bon.count({ where: { status: 'archived', updatedAt: { gte: b.start, lt: b.end } } }),
        ]);
        return { month: b.month, created, archived };
      }),
    );
    return results;
  }

  /** Export CSV du parc en circulation (détail par équipement). */
  async getCirculatingCsv(): Promise<string> {
    const items = await this.prisma.bonEquipment.findMany({
      where: {
        returnedAt: null,
        notReturned: false,
        bon: { status: { in: ['active', 'partially_returned'] } },
      },
      select: {
        customLabel: true,
        serialNumber: true,
        inventoryNumber: true,
        catalogItem: { select: { category: true, brand: true, model: true } },
        bon: {
          select: {
            reference: true,
            dateMiseDisposition: true,
            dateRestitution: true,
            collaborateur: { select: { displayName: true, email: true, department: true } },
            filiale: { select: { displayName: true } },
          },
        },
      },
      take: 10000,
    });

    const escape = (v: string) => {
      let s = String(v ?? '').replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s}"`;
    };

    const headers = [
      'Référence', 'Filiale', 'Collaborateur', 'Email', 'Service',
      'Équipement', 'N° série', 'N° inventaire', 'Date mise à dispo', 'Date restitution prévue',
    ];
    const rows = items.map((it) => {
      const equip = it.catalogItem
        ? `${CATEGORY_LABELS[it.catalogItem.category] ?? it.catalogItem.category} — ${it.catalogItem.brand} ${it.catalogItem.model}`
        : it.customLabel ?? '';
      return [
        it.bon.reference,
        it.bon.filiale?.displayName ?? '',
        it.bon.collaborateur.displayName,
        it.bon.collaborateur.email,
        it.bon.collaborateur.department ?? '',
        equip,
        it.serialNumber ?? '',
        it.inventoryNumber ?? '',
        it.bon.dateMiseDisposition ? new Date(it.bon.dateMiseDisposition).toLocaleDateString('fr-FR') : '',
        it.bon.dateRestitution ? new Date(it.bon.dateRestitution).toLocaleDateString('fr-FR') : '',
      ].map(escape);
    });

    const csv = [headers.map(escape).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    return '﻿' + csv; // BOM UTF-8 pour Excel
  }
}
