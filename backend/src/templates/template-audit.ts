import { PrismaService } from '../prisma/prisma.service';

/** Bon réel utilisé pour rendre l'email de test (lot H3), le cas échéant. */
export interface TemplateTestBon {
  id: string;
  reference: string;
}

/** Journalise l'envoi d'un email de test pour un template — même style que
 *  equipment-audit.ts (action snake_case + `details` JSON + userId). Tracé
 *  qu'il ait réussi ou échoué : `success` reflète l'issue réelle de l'envoi.
 *  Quand le test a été rendu avec les données d'un vrai bon, son identifiant et
 *  sa référence sont repris dans `details` — sans rattacher la ligne au bon
 *  (bonId) : un test d'administration n'a pas sa place dans l'historique du bon. */
export async function recordTemplateTestSent(
  prisma: PrismaService,
  templateId: string,
  email: string,
  success: boolean,
  userId?: string,
  bon?: TemplateTestBon,
): Promise<void> {
  const details = bon
    ? { templateId, email, success, bonId: bon.id, bonReference: bon.reference }
    : { templateId, email, success };
  await prisma.auditLog.create({
    data: { userId, action: 'email_template_test_sent', details },
  });
}
