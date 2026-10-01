import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from './audit-actions';
import { AuditEntryInput, AuditWriter, writeAuditEntry } from './audit-record';

/**
 * Seul point d'écriture du journal d'audit (voir docs/api-conventions.md § 5).
 * La lecture du journal (écran, export CSV) est dans `AuditJournalService`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trace une action du catalogue (`contracts/audit-actions.ts`). Seul point
   * d'écriture du journal. Dans une transaction, passer `{ tx }` : l'entrée
   * est alors annulée avec l'opération. L'échec est propagé ; pour une trace
   * qui ne doit jamais bloquer l'action, utiliser `recordSafely`.
   */
  async record(action: AuditAction, entry: AuditEntryInput, options: { tx?: AuditWriter } = {}): Promise<void> {
    await writeAuditEntry(options.tx ?? this.prisma, action, entry);
  }

  /** Comme `record`, sans jamais faire échouer l'action tracée : l'échec
   *  d'écriture est seulement journalisé côté serveur. */
  async recordSafely(action: AuditAction, entry: AuditEntryInput): Promise<void> {
    try {
      await this.record(action, entry);
    } catch (err) {
      this.logger.error(`Entrée d'audit ${action} non écrite : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
