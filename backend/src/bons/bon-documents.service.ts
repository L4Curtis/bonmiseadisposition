import { Injectable } from '@nestjs/common';
import type { BonStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { listBonDocuments } from '../pdf/snapshot-list';
import type { DocumentAudience } from '../pdf/snapshot-audience';
import type { AuthUser } from '../auth/auth-user.interface';
import { isItRole } from '../common/roles';
import { toFullListResponse } from '../common/pagination';
import type { ListResponse } from '../contracts/common';
import type { MissingPdfSnapshotsResponse, PdfSnapshotInfo } from '../contracts/bons';
import { verifyCollaboratorAccess } from './bons-access';
import { assertValidPdfQuery, resolveBonPdf } from './bons-pdf-lookup';
import { renderReadyPv } from './bons-ready-pv';
import { computeMissingPdfSnapshotTypes } from './bons-missing-snapshots';
import { findBonOrThrow } from './queries/bon-where';

/** Fichier PDF à renvoyer tel quel au navigateur. */
export interface BonPdfFile {
  readonly filename: string;
  readonly data: Buffer;
}

/** Paramètres de `GET /bons/:id/pdf`. */
export interface BonPdfQuery {
  readonly type: 'mise_disposition' | 'restitution';
  readonly stage?: string;
  readonly snapshot?: string;
}

/** Public des documents : l'IT voit tout l'historique, un autre compte
 *  seulement les documents qu'il peut garder. */
export function documentAudience(user: AuthUser): DocumentAudience {
  return isItRole(user.role) ? 'it' : 'collaborator';
}

/**
 * Documents d'un bon (PDF enregistrés, PDF à la demande, PV prêt) et contrôle
 * d'accès des routes « propriétaire » : ce que le contrôleur des bons lisait
 * lui-même en base. Le contrôleur ne fait plus qu'écrire la réponse HTTP.
 */
@Injectable()
export class BonDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  /** Routes « propriétaire » : un compte non IT ne voit que ses propres bons,
   *  jamais un brouillon (404) ; l'IT a un accès transverse (bons-access.ts). */
  assertCanRead(bonId: string, user: AuthUser): Promise<void> {
    return verifyCollaboratorAccess(this.prisma, bonId, user);
  }

  /** Les documents du bon, du plus ancien au plus récent (un par signature,
   *  jamais écrasé) : tous pour l'IT, ceux qu'il peut garder pour le titulaire. */
  async documents(bonId: string, user: AuthUser): Promise<ListResponse<PdfSnapshotInfo>> {
    await this.assertCanRead(bonId, user);
    return toFullListResponse(await listBonDocuments(this.prisma, bonId, documentAudience(user)));
  }

  /** Documents attendus (une signature signée existe) mais absents, par
   *  exemple après l'échec d'une génération (audit `pdf_snapshot_failed`). */
  async missingDocuments(bonId: string): Promise<MissingPdfSnapshotsResponse> {
    const bon = await findBonOrThrow(this.prisma, bonId);
    const [signedSignatures, existingSnapshots] = await Promise.all([
      this.prisma.signature.findMany({ where: { bonId, signed: true }, select: { type: true, pdfType: true } }),
      this.prisma.pdfSnapshot.findMany({ where: { bonId }, select: { type: true } }),
    ]);
    const existingTypes = new Set(existingSnapshots.map((s) => s.type as string));
    return { missing: computeMissingPdfSnapshotTypes(signedSignatures, existingTypes, bon.status as BonStatus) };
  }

  /** PDF du bon : le document enregistré demandé (ou la version en vigueur),
   *  sinon généré à la volée avec les signatures complètes, pour que le
   *  certificat de preuve soit celui du document enregistré. */
  async pdf(bonId: string, user: AuthUser, query: BonPdfQuery): Promise<BonPdfFile> {
    await this.assertCanRead(bonId, user);
    assertValidPdfQuery(query.type, query.stage, query.snapshot);
    const bon = await findBonOrThrow(this.prisma, bonId);
    const stored = await resolveBonPdf(this.prisma, bon, query.type, query.stage, query.snapshot, documentAudience(user));
    if (stored) return stored;
    const fullSignatures = await this.prisma.signature.findMany({ where: { bonId: bon.id } });
    const data = await this.pdfService.generateBonPdf({ ...bon, signatures: fullSignatures }, null, query.type);
    return { filename: `bon-${bon.reference}.pdf`, data };
  }

  /** PV de non-restitution déjà certifié par l'IT mais pas encore émis,
   *  généré à la volée (rien n'est enregistré). IT seulement. */
  async readyPv(bonId: string): Promise<BonPdfFile> {
    const bon = await findBonOrThrow(this.prisma, bonId);
    return renderReadyPv({ prisma: this.prisma, pdfService: this.pdfService }, bon);
  }
}
