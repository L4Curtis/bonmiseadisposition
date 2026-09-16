/**
 * Test de « démarrage » du graphe de modules Bons ↔ Signature ↔ Contestation.
 *
 * Contexte (lot B) : SignatureService a besoin de BonsService (hook PV de
 * clôture après signature de restitution) alors que BonsService dépend déjà
 * de SignatureService, et BonsModule ↔ ContestationModule forment déjà un
 * cycle résolu par forwardRef. Une première tentative faisait passer
 * SignatureModule par un forwardRef(() => BonsModule) supplémentaire, ce qui
 * cassait le démarrage réel de l'application (« Nest cannot create the
 * ContestationModule instance… imports array is undefined ») — reproductible
 * avec Test.createTestingModule({ imports: [BonsModule, SignatureModule,
 * ContestationModule] }).
 *
 * La correction retenue supprime le cycle au niveau des MODULES : BonsModule
 * importe SignatureModule normalement (comme avant lot B) et SignatureService
 * résout BonsService paresseusement via ModuleRef.get(BonsService, { strict:
 * false }) au moment du hook plutôt que par injection de constructeur — donc
 * plus aucun besoin de forwardRef entre ces deux modules.
 *
 * Ce test ne vérifie AUCUNE logique métier : uniquement que Nest sait
 * construire ce graphe de DI sans erreur. Toutes les dépendances feuilles
 * (Prisma, Config, Encryption, Notification, Pdf, PdfTemplates, Smb,
 * Timestamp) sont mockées pour éviter des effets de bord sans rapport avec la
 * question posée ici (connexion DB réelle, ENCRYPTION_KEY requise en env,
 * SMTP, TemplatesService non global dans ce sous-graphe restreint…).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BonsModule } from '../bons/bons.module';
import { BonsService } from '../bons/bons.service';
import { SignatureModule } from '../signature/signature.module';
import { SignatureService } from '../signature/signature.service';
import { TimestampService } from '../signature/timestamp.service';
import { ContestationModule } from '../contestation/contestation.module';
import { ContestationService } from '../contestation/contestation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { EncryptionService } from '../config/encryption.service';
import { NotificationService } from '../notification/notification.service';
import { PdfService } from '../pdf/pdf.service';
import { PdfTemplatesService } from '../pdf/pdf-templates.service';
import { SmbService } from '../smb/smb.service';
import { createMockPrismaService } from '../common/__tests__/helpers/mock-prisma';
import {
  createMockConfigService,
  createMockEncryptionService,
  createMockNotificationService,
  createMockPdfService,
  createMockPdfTemplatesService,
  createMockSmbService,
  createMockTimestampService,
} from '../common/__tests__/helpers/mock-services';

describe('Module graph boot (Bons ↔ Signature ↔ Contestation)', () => {
  it('should compile without a circular-imports / undefined-imports-array error', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [BonsModule, SignatureModule, ContestationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrismaService())
      .overrideProvider(AppConfigService)
      .useValue(createMockConfigService())
      .overrideProvider(EncryptionService)
      .useValue(createMockEncryptionService())
      .overrideProvider(NotificationService)
      .useValue(createMockNotificationService())
      .overrideProvider(PdfService)
      .useValue(createMockPdfService())
      .overrideProvider(PdfTemplatesService)
      .useValue(createMockPdfTemplatesService())
      .overrideProvider(SmbService)
      .useValue(createMockSmbService())
      .overrideProvider(TimestampService)
      .useValue(createMockTimestampService())
      .compile();

    expect(moduleRef).toBeDefined();
    // Chaque service applicatif du cycle doit avoir été construit avec succès —
    // c'est précisément ce que « imports array is undefined » empêchait.
    expect(moduleRef.get(BonsService)).toBeInstanceOf(BonsService);
    expect(moduleRef.get(SignatureService)).toBeInstanceOf(SignatureService);
    expect(moduleRef.get(ContestationService)).toBeInstanceOf(ContestationService);

    await moduleRef.close();
  });
});
