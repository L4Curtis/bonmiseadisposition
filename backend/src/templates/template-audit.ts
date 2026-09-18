import { PrismaService } from '../prisma/prisma.service';

/** Journalise l'envoi d'un email de test pour un template — même style que
 *  equipment-audit.ts (action snake_case + `details` JSON + userId). Tracé
 *  qu'il ait réussi ou échoué : `success` reflète l'issue réelle de l'envoi. */
export async function recordTemplateTestSent(
  prisma: PrismaService,
  templateId: string,
  email: string,
  success: boolean,
  userId?: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'email_template_test_sent',
      details: { templateId, email, success },
    },
  });
}
