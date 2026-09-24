import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { resolveAppUrl } from '../notification/app-url';
import { TemplatesService } from './templates.service';
import { buildBonPreviewVars, NON_BON_TEMPLATES, PreviewBon } from './bon-preview-vars';

/** Nombre maximal de bons proposés par la recherche de l'aperçu. */
const SEARCH_LIMIT = 10;
/** Longueur maximale de la saisie de recherche (une référence fait ~13 caractères). */
const SEARCH_MAX_LENGTH = 50;

export interface PreviewBonOption {
  id: string;
  reference: string;
  status: string;
  collaborateurName: string | null;
  filialeName: string | null;
}

export interface BonPreviewResult {
  html: string;
  subject: string;
  reference: string;
  sampleVariables: string[];
}

/**
 * Aperçu d'un modèle d'email avec un vrai bon (lot H3) : recherche d'un bon
 * par référence, puis rendu du modèle avec ses données.
 *
 * Lecture seule : aucune écriture en base, aucun envoi, aucun jeton de
 * signature lu ni créé (le lien affiché est factice, cf. bon-preview-vars).
 * Les bons anonymisés sont exclus : leurs données personnelles ont été
 * purgées, l'aperçu n'aurait rien de réel à montrer.
 */
@Injectable()
export class TemplateBonPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AppConfigService,
    private readonly templatesService: TemplatesService,
  ) {}

  /** Bons dont la référence contient la saisie (les plus récents d'abord). */
  async searchBons(query: string | undefined): Promise<PreviewBonOption[]> {
    const q = (query ?? '').trim().slice(0, SEARCH_MAX_LENGTH);
    const bons = await this.prisma.bon.findMany({
      where: {
        anonymizedAt: null,
        ...(q ? { reference: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        reference: true,
        status: true,
        collaborateur: { select: { displayName: true } },
        filiale: { select: { displayName: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT,
    });
    return bons.map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      collaborateurName: b.collaborateur?.displayName ?? null,
      filialeName: b.filiale?.displayName ?? b.filiale?.name ?? null,
    }));
  }

  /** Rendu du modèle `templateId` avec les données du bon `bonId`. */
  async render(templateId: string, bonId: string): Promise<BonPreviewResult> {
    const template = this.templatesService.getTemplateById(templateId); // NotFoundException si inconnu
    if (NON_BON_TEMPLATES.includes(templateId)) {
      throw new BadRequestException("Ce modèle ne porte pas sur un bon : l'aperçu avec un bon réel ne s'applique pas.");
    }
    const bon = await this.loadBon(bonId);
    const appUrl = await this.getAppUrl();
    const { vars, subject, sampleVariables } = buildBonPreviewVars(template, bon, appUrl);
    const html = await this.templatesService.renderTemplate(templateId, vars);
    return { html, subject, reference: bon.reference, sampleVariables };
  }

  private async loadBon(bonId: string): Promise<PreviewBon> {
    const bon = await this.prisma.bon.findUnique({
      where: { id: bonId },
      select: {
        id: true,
        reference: true,
        civilite: true,
        status: true,
        collaborateurEmail: true,
        dateMiseDisposition: true,
        dateRestitution: true,
        anonymizedAt: true,
        collaborateur: { select: { displayName: true, email: true } },
        filiale: { select: { displayName: true, name: true } },
        equipments: {
          select: {
            id: true,
            order: true,
            customLabel: true,
            serialNumber: true,
            returnedAt: true,
            notReturned: true,
            notReturnedReason: true,
            catalogItem: { select: { brand: true, model: true } },
          },
        },
        // Volontairement sans `token` : l'aperçu ne doit jamais le lire.
        signatures: { select: { type: true, signed: true }, orderBy: { createdAt: 'desc' } },
        contestations: {
          select: {
            message: true,
            resolutionMessage: true,
            user: { select: { displayName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!bon) throw new NotFoundException('Bon introuvable');
    if (bon.anonymizedAt) {
      throw new BadRequestException("Ce bon a été anonymisé : ses données personnelles ne sont plus disponibles pour l'aperçu.");
    }
    const { contestations, ...rest } = bon;
    return { ...rest, latestContestation: contestations[0] ?? null };
  }

  private async getAppUrl(): Promise<string> {
    const configured = await this.configService.get('general', 'app_url');
    return resolveAppUrl(configured, process.env);
  }
}
