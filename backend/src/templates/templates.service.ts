import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateDefinition, TEMPLATES, SIGNER_URL_REQUIRED_TEMPLATES, MAX_TEMPLATE_HTML_LENGTH, PREVIEW_VARS } from './template-catalog';
import { renderTemplateHtml } from './render';
import { filterValidImportItems } from './import-validation';
import {
  getCustomizedTemplates,
  getCustomTemplateHtml,
  saveTemplateHtml,
  deleteCustomTemplate,
  importTemplatesTransaction,
} from './template-repository';
import {
  defaultMiseDisposition,
  defaultRestitution,
  defaultPvCloture,
} from './defaults/signature-request-defaults';
import {
  defaultConfirmationMiseDisposition,
  defaultConfirmationRestitution,
  defaultConfirmationPvCloture,
} from './defaults/confirmation-defaults';
import {
  defaultContestationAlert,
  defaultContestationResolved,
  defaultContestationRejected,
} from './defaults/contestation-defaults';
import { defaultReminder, defaultRestitutionDueReminder } from './defaults/reminder-defaults';
import { defaultDepartureAlert } from './defaults/departure-alert-defaults';

export type { TemplateDefinition } from './template-catalog';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Catalogue ───────────────────────────────────────────────────────────────

  async getAll(): Promise<(TemplateDefinition & { isCustomized: boolean })[]> {
    const customized = await getCustomizedTemplates(this.configService);
    return TEMPLATES.map((t) => ({ ...t, isCustomized: !!customized[t.id] }));
  }

  getTemplateById(id: string): TemplateDefinition {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new NotFoundException(`Template "${id}" introuvable`);
    return tpl;
  }

  // ─── HTML retrieval ──────────────────────────────────────────────────────────

  getDefaultHtml(id: string): string {
    this.getTemplateById(id);
    return this.buildDefaultHtml(id);
  }

  async getTemplateHtml(id: string): Promise<string> {
    this.getTemplateById(id);
    const custom = await getCustomTemplateHtml(this.configService, id);
    return custom ?? this.buildDefaultHtml(id);
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  render(html: string, vars: Record<string, string>): string {
    return renderTemplateHtml(html, vars);
  }

  async renderTemplate(id: string, vars: Record<string, string>): Promise<string> {
    const html = await this.getTemplateHtml(id);
    return this.render(html, vars);
  }

  async getPreviewHtml(id: string): Promise<string> {
    this.getTemplateById(id);
    const html = await this.getTemplateHtml(id);
    return this.render(html, PREVIEW_VARS);
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /** Valide le HTML d'un template avant sauvegarde (édition unique ou import). */
  private validateTemplateHtml(id: string, html: string): void {
    if (typeof html !== 'string' || html.trim().length === 0) {
      throw new BadRequestException(`Le contenu HTML du template "${id}" est vide`);
    }
    if (html.length > MAX_TEMPLATE_HTML_LENGTH) {
      throw new BadRequestException(
        `Le contenu HTML du template "${id}" dépasse la taille maximale autorisée (200 000 caractères)`,
      );
    }
    if (SIGNER_URL_REQUIRED_TEMPLATES.includes(id) && !html.includes('{{SIGNER_URL}}')) {
      throw new BadRequestException(`Le template "${id}" doit contenir la variable {{SIGNER_URL}}`);
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async updateTemplate(id: string, html: string, updatedById?: string): Promise<void> {
    this.getTemplateById(id);
    this.validateTemplateHtml(id, html);
    await saveTemplateHtml(this.configService, id, html, updatedById);
  }

  async resetTemplate(id: string): Promise<void> {
    this.getTemplateById(id);
    await deleteCustomTemplate(this.prisma, this.configService, id);
  }

  // ─── Export / Import ─────────────────────────────────────────────────────────

  async exportAll() {
    const customized = await getCustomizedTemplates(this.configService);
    const templates = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      html: (customized[t.id] ?? null) || this.buildDefaultHtml(t.id),
      isCustomized: !!customized[t.id],
    }));
    return { exportedAt: new Date().toISOString(), templates };
  }

  async importAll(
    data: { templates: { id: string; html: string }[] },
    updatedById?: string,
  ): Promise<{ imported: number; skipped: number }> {
    const knownIds = TEMPLATES.map((t) => t.id);
    const { valid, skipped } = filterValidImportItems(
      data.templates,
      knownIds,
      SIGNER_URL_REQUIRED_TEMPLATES,
      MAX_TEMPLATE_HTML_LENGTH,
    );

    await importTemplatesTransaction(this.prisma, this.configService, valid, updatedById);

    return { imported: valid.length, skipped };
  }

  // ─── Default HTML templates ──────────────────────────────────────────────────

  private buildDefaultHtml(id: string): string {
    switch (id) {
      case 'mise_disposition_request':      return defaultMiseDisposition();
      case 'restitution_request':           return defaultRestitution();
      case 'confirmation_mise_disposition': return defaultConfirmationMiseDisposition();
      case 'confirmation_restitution':      return defaultConfirmationRestitution();
      case 'confirmation_pv_cloture':       return defaultConfirmationPvCloture();
      case 'pv_cloture_request':            return defaultPvCloture();
      case 'contestation_alert':            return defaultContestationAlert();
      case 'contestation_resolved':         return defaultContestationResolved();
      case 'contestation_rejected':         return defaultContestationRejected();
      case 'reminder':                      return defaultReminder();
      case 'restitution_due_reminder':      return defaultRestitutionDueReminder();
      case 'departure_alert':               return defaultDepartureAlert();
      default: throw new NotFoundException(`Template "${id}" introuvable`);
    }
  }
}
