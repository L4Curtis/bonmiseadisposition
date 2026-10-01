import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditJournalService } from './audit-journal.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Journal d'audit. Global : tout module peut injecter `AuditService` pour
 * tracer une action (`record`), sans l'importer — comme la configuration.
 * La lecture (écran du journal, export) est dans `AuditJournalService`.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditJournalService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
