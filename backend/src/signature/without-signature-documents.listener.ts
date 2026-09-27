import { Injectable, Logger } from '@nestjs/common';
import type { PdfSnapshotType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { SmbService } from '../smb/smb.service';
import {
  DOMAIN_EVENTS,
  OnDomainEvent,
  BonClosedWithoutSignatureEvent,
  BonHandoverWithoutSignatureEvent,
} from '../common/events';
import type { WithoutSignatureNotice } from '../pdf/pdf-types';
import { BON_FOR_SIGNATURE_SELECT } from './select-shape';
import { generatePdfSnapshot } from './pdf-snapshot';

/**
 * Document probant des deux gestes « sans signature » (R-031) : « Constater
 * la remise sans signature » → `remise_sans_signature`, « Clôturer sans
 * signature » → `cloture_sans_signature`. Le PDF porte le motif, le
 * technicien qui a constaté et la date, et jamais de case « signature du
 * collaborateur » remplie. Idempotent : un document déjà produit n'est pas
 * refait (un événement rejoué n'en crée pas un second).
 */
@Injectable()
export class WithoutSignatureDocumentsListener {
  private readonly logger = new Logger(WithoutSignatureDocumentsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly smbService: SmbService,
  ) {}

  @OnDomainEvent(DOMAIN_EVENTS.bonHandoverWithoutSignature)
  async onHandover(event: BonHandoverWithoutSignatureEvent): Promise<void> {
    await this.produce(event, 'handover', 'remise_sans_signature');
  }

  @OnDomainEvent(DOMAIN_EVENTS.bonClosedWithoutSignature)
  async onClosure(event: BonClosedWithoutSignatureEvent): Promise<void> {
    await this.produce(event, 'closure', 'cloture_sans_signature');
  }

  private async produce(
    event: BonHandoverWithoutSignatureEvent | BonClosedWithoutSignatureEvent,
    kind: WithoutSignatureNotice['kind'],
    type: PdfSnapshotType,
  ): Promise<void> {
    try {
      const existing = await this.prisma.pdfSnapshot.findFirst({
        where: { bonId: event.bonId, type },
        select: { id: true },
      });
      if (existing) return;
      const [bon, actor] = await Promise.all([
        this.prisma.bon.findUniqueOrThrow({ where: { id: event.bonId }, select: BON_FOR_SIGNATURE_SELECT }),
        event.actorId ? this.prisma.user.findUnique({ where: { id: event.actorId }, select: { displayName: true } }) : null,
      ]);
      const notice: WithoutSignatureNotice = {
        kind,
        reason: event.reason,
        actorName: actor?.displayName ?? "l'équipe informatique",
        at: event.occurredAt,
      };
      await generatePdfSnapshot(
        { pdfService: this.pdfService, smbService: this.smbService, logger: this.logger },
        { ...bon, _withoutSignature: notice },
        type,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Document ${type} du bon ${event.bonReference} non produit : ${message}`);
      await this.prisma.auditLog
        .create({ data: { bonId: event.bonId, action: 'pdf_snapshot_failed', details: { type, error: message } } })
        .catch(() => undefined);
    }
  }
}
