import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateImportItem } from './import-validation';

/** Templates personnalisés actuellement enregistrés (catégorie "email_templates"). */
export async function getCustomizedTemplates(configService: AppConfigService): Promise<Record<string, string | null>> {
  return configService.getAll('email_templates');
}

/** HTML personnalisé d'un template, ou null si aucune surcharge n'existe. */
export async function getCustomTemplateHtml(configService: AppConfigService, id: string): Promise<string | null> {
  return configService.get('email_templates', id);
}

/** Persiste le HTML personnalisé d'un template (édition unique). */
export async function saveTemplateHtml(
  configService: AppConfigService,
  id: string,
  html: string,
  updatedById?: string,
): Promise<void> {
  await configService.set('email_templates', id, html, { updatedById });
}

/** Supprime la personnalisation d'un template — un appel à getTemplateHtml
 *  après reset retombe donc sur buildDefaultHtml(id). */
export async function deleteCustomTemplate(
  prisma: PrismaService,
  configService: AppConfigService,
  id: string,
): Promise<void> {
  await prisma.appConfig.deleteMany({ where: { category: 'email_templates', key: id } });
  configService.invalidateCache('email_templates', id);
}

/** Écrit en une seule transaction les templates importés déjà validés
 *  (voir import-validation.ts), puis invalide leur cache individuellement. */
export async function importTemplatesTransaction(
  prisma: PrismaService,
  configService: AppConfigService,
  items: TemplateImportItem[],
  updatedById?: string,
): Promise<void> {
  if (items.length === 0) return;

  await prisma.$transaction(
    items.map((item) =>
      prisma.appConfig.upsert({
        where: { category_key: { category: 'email_templates', key: item.id } },
        update: { value: item.html, encrypted: false, updatedById },
        create: { category: 'email_templates', key: item.id, value: item.html, encrypted: false, updatedById },
      }),
    ),
  );
  for (const item of items) {
    configService.invalidateCache('email_templates', item.id);
  }
}
