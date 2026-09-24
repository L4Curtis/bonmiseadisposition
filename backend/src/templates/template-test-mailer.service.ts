import { Injectable } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplateBonPreviewService } from './template-bon-preview.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { recordTemplateTestSent, TemplateTestBon } from './template-audit';

export interface TemplateTestResult {
  success: boolean;
  message: string;
}

/**
 * Envoi d'un email de test pour un template admin, à l'adresse fournie, sans
 * jamais créer ni modifier de bon. Deux rendus possibles :
 * - par défaut, le même jeu de variables d'exemple que l'aperçu (PREVIEW_VARS,
 *   cf. TemplatesService.getPreviewHtml) ;
 * - avec `bonId` (lot H3), les données d'un vrai bon, exactement comme dans
 *   l'aperçu avec un bon (lien de signature factice, cf. bon-preview-vars).
 * Le résultat (succès ou échec, ex. SMTP non configuré) est toujours renvoyé
 * dans la réponse plutôt que levé en exception, et tracé dans le journal d'audit.
 */
@Injectable()
export class TemplateTestMailerService {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
    private readonly bonPreviewService: TemplateBonPreviewService,
  ) {}

  async sendTest(templateId: string, email: string, userId?: string, bonId?: string): Promise<TemplateTestResult> {
    const tpl = this.templatesService.getTemplateById(templateId); // NotFoundException si id inconnu
    const { html, bon } = await this.renderTest(templateId, bonId);
    const subject = bon ? `[TEST] ${tpl.name} — ${bon.reference}` : `[TEST] ${tpl.name}`;

    const result = await this.notificationService.sendEmail(email, subject, html);
    await recordTemplateTestSent(this.prisma, templateId, email, result.ok, userId, bon);

    return {
      success: result.ok,
      message: result.ok
        ? `Email de test envoyé à ${email}.`
        : (result.error ?? "Échec de l'envoi de l'email de test."),
    };
  }

  private async renderTest(templateId: string, bonId?: string): Promise<{ html: string; bon?: TemplateTestBon }> {
    if (!bonId) return { html: await this.templatesService.getPreviewHtml(templateId) };
    const preview = await this.bonPreviewService.render(templateId, bonId);
    return { html: preview.html, bon: { id: bonId, reference: preview.reference } };
  }
}
