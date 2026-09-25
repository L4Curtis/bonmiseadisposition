/**
 * L'application Nest RÉELLE, montée pour les tests de contrat : le vrai
 * AppModule (gardes, pipes, filtres, limiteur de débit, planificateur…) et la
 * configuration HTTP de production, appliquée par la même fonction que
 * src/main.ts (src/bootstrap/configure-app.ts). Seuls diffèrent l'écoute d'un
 * port (supertest appelle le serveur en mémoire), l'arrêt propre sur signal et
 * la création de l'admin par défaut, sans effet sur les réponses.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApp, resolveCorsOrigin } from '../../../src/bootstrap/configure-app';
import { AppConfigService } from '../../../src/config/config.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { isContractDatabaseName } from './database';

/**
 * Refuse de continuer si PostgreSQL annonce une autre base que la base
 * jetable. Vérifié AVANT `app.init()` : aucun hook de démarrage ni aucune
 * requête ne touche la base tant que ce contrôle n'est pas passé.
 */
async function assertConnectedToContractDatabase(moduleRef: TestingModule): Promise<void> {
  const prisma = moduleRef.get(PrismaService);
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name ?? '';
  if (!isContractDatabaseName(name)) {
    await prisma.$disconnect();
    await moduleRef.close();
    throw new Error(`Base connectée inattendue (« ${name} ») : tests de contrat interrompus.`);
  }
}

export async function createContractApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await assertConnectedToContractDatabase(moduleRef);
  const app = moduleRef.createNestApplication({
    // Les erreurs attendues (403, 404, 409…) rempliraient la sortie : journal
    // coupé, sauf demande explicite pour enquêter sur un échec.
    logger: process.env.CONTRACT_LOGS === '1' ? ['error', 'warn'] : false,
  });
  configureApp(app, { corsOrigin: resolveCorsOrigin() });
  await app.init();
  await app.get(AppConfigService).verifyEncryptionCanary();
  return app;
}
