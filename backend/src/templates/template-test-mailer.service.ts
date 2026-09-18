import { Injectable } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { recordTemplateTestSent } from './template-audit';

export interface TemplateTestResult {
  success: boolean;
  message: string;
}

/**
 * Envoi d'un email de test pour un template admin : rendu avec le même jeu de
 * variables d'exemple que l'aperçu (PREVIEW_VARS, cf. TemplatesService.getPreviewHtml),
 * envoyé à l'adresse fournie sans jamais créer ni modifier de bon. Le résultat
 * (succès ou échec, ex. SMTP non configuré) est toujours renvoyé dans la
 * réponse plutôt que levé en exception, et tracé dans le journal d'audit.
 */
@Injectable()
export class TemplateTestMailerService {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  async sendTest(templateId: string, email: string, userId?: string): Promise<TemplateTestResult> {
    const tpl = this.templatesService.getTemplateById(templateId); // NotFoundException si id inconnu
    const html = await this.templatesService.getPreviewHtml(templateId);
    const subject = `[TEST] ${tpl.name}`;

    const result = await this.notificationService.sendEmail(email, subject, html);
    await recordTemplateTestSent(this.prisma, templateId, email, result.ok, userId);

    return {
      success: result.ok,
      message: result.ok
        ? `Email de test envoyé à ${email}.`
        : (result.error ?? "Échec de l'envoi de l'email de test."),
    };
  }
}
