import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
// pdfkit est un module CommonJS dont l'export est la classe elle-même
// (`module.exports = PDFDocument`) : `import = require` est la forme TypeScript
// exacte pour ce cas. Compilé par `nest build`, le résultat est identique à
// l'ancien `import * as` (`const PDFDocument = require("pdfkit")`), mais il
// reste une vraie classe quand les tests l'exécutent en ESM (Vitest), là où un
// espace de noms `import * as` n'est pas constructible.
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { PdfSnapshotType } from '../common/types';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfTemplateConfig } from './pdf-template-config';
import { regenerateMissingSnapshots as regenerateMissingSnapshotsImpl } from './snapshot-regeneration';
import { PdfDocumentType, RenderFonts, formatDate, getStatusLabel } from './render/layout';
import { drawHeader } from './render/header';
import { drawPartiesSection } from './render/parties';
import { drawEquipmentTable, drawAvenantNote } from './render/equipment-table';
import { drawSignaturesSection, renderSignatureBox, SignatureBoxOptions } from './render/signatures';
import { drawCertificateSection } from './render/certificate';
import { drawFooterSection } from './render/footer';
import { SIGNATURES_DIR, UPLOADS_DIR } from '../common/storage-paths';

export interface SigImages {
  it: string | null;
  collab: string | null;
}

/** Shape of the bon object expected by PDF generation methods. */
export interface BonForPdf {
  id: string;
  reference: string;
  civilite: string;
  status: string;
  dateMiseDisposition: Date | string;
  dateRestitution?: Date | string | null;
  notes?: string | null;
  filiale: {
    displayName?: string;
    name?: string;
    logoPath?: string | null;
    stampPath?: string | null;
    address?: string | null;
    siret?: string | null;
  };
  collaborateur: {
    displayName?: string;
    department?: string | null;
  };
  collaborateurEmail?: string | null;
  createdBy?: {
    displayName?: string;
  };
  equipments: Array<{
    id: string;
    catalogItem?: { brand: string; model: string } | null;
    customLabel?: string | null;
    serialNumber?: string | null;
    inventoryNumber?: string | null;
    notes?: string | null;
    returnedAt?: Date | string | null;
    notReturned?: boolean;
    notReturnedReason?: string | null;
  }>;
  signatures?: Array<{
    type: string;
    signed: boolean;
    signedAt?: Date | string | null;
    signatureImagePath?: string | null;
    // Métadonnées de preuve (certificat de signature électronique)
    signerEmail?: string | null;
    signerIp?: string | null;
    signerUserAgent?: string | null;
    mentionLuApprouve?: boolean;
    isInPerson?: boolean;
    signedByProxy?: boolean;
  }>;
  /** Used by avenant generation to filter equipment */
  _avenantEquipmentIds?: string[];
  /** Clôture unilatérale : remplace la mention de la case signature collaborateur */
  _unilateralNote?: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  // ─── Polices Unicode embarquées ─────────────────────────────────────────────
  // Les polices AFM standard de PDFKit (Helvetica…) n'encodent que Latin-1 :
  // tout caractère hors de ce jeu (Ł, cyrillique, CJK, emoji…) est rendu en
  // glyphe faux. Sur un document de preuve légale (identité du signataire),
  // c'est inacceptable. On embarque donc DejaVu Sans (licence Bitstream Vera,
  // libre et redistribuable) et on l'enregistre sur chaque document généré.
  // __dirname résout correctement en dev (tests Vitest / ts-node : backend/src/pdf)
  // ET en prod (dist/pdf, copié par compilerOptions.assets de nest-cli.json).
  private readonly fontsDir = join(__dirname, 'fonts');
  private readonly fontRegularPath = join(this.fontsDir, 'DejaVuSans.ttf');
  private readonly fontBoldPath = join(this.fontsDir, 'DejaVuSans-Bold.ttf');
  private readonly customFontsAvailable: boolean =
    existsSync(this.fontRegularPath) && existsSync(this.fontBoldPath);

  /** Nom de police (corps de texte) à utiliser dans tout le document. */
  private readonly FONT_REGULAR: string = this.customFontsAvailable ? 'Body' : 'Helvetica';
  /** Nom de police (gras) à utiliser dans tout le document. */
  private readonly FONT_BOLD: string = this.customFontsAvailable ? 'Body-Bold' : 'Helvetica-Bold';

  /** Signatures manuscrites chiffrées (même dossier que SignatureService). */
  private readonly signaturesDir = SIGNATURES_DIR;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfTemplatesService: PdfTemplatesService,
    private readonly encryption: EncryptionService,
  ) {
    if (!this.customFontsAvailable) {
      this.logger.warn(
        `Polices Unicode introuvables (${this.fontRegularPath}) — repli sur Helvetica : ` +
        'les caractères hors Latin-1 (accents étendus, cyrillique, CJK, emoji…) seront mal rendus dans les PDF.',
      );
    }
  }

  /**
   * Génère le PDF d'un bon et le sauvegarde en base.
   * snapshotType = PdfSnapshotType enum value.
   *
   * Sémantique d'écrasement (UNIQUE(bonId, type) — une seule ligne par type) :
   * - signature_collab_mise_disposition : signé UNE fois → jamais écrasé ;
   * - signature_collab_restitution / cloture / it_* : régénérés par design
   *   (restitutions partielles successives, PV brouillon IT → PV co-signé) ;
   * - avenant : un seul avenant conservé par bon (limitation connue).
   */
  async generateAndSave(
    bon: BonForPdf,
    snapshotType: string, // PdfSnapshotType enum value
    sigImages: SigImages,
    filename: string,
  ): Promise<Buffer> {
    // Determine document type from snapshot type
    const documentType = this.getDocumentType(snapshotType);
    const pdf = await this.renderPdf(bon, sigImages, documentType);

    // Guard: reject oversized PDFs (10 MB max)
    const MAX_PDF_SIZE = 10 * 1024 * 1024;
    if (pdf.length > MAX_PDF_SIZE) {
      throw new Error(`PDF trop volumineux (${(pdf.length / 1024 / 1024).toFixed(1)} MB > 10 MB) pour le bon ${bon.reference}`);
    }

    // The signed mise-à-disposition document is legally final: never replace it
    if (snapshotType === 'signature_collab_mise_disposition') {
      const existing = await this.prisma.pdfSnapshot.findUnique({
        where: { bonId_type: { bonId: bon.id, type: snapshotType } },
        select: { id: true, data: true },
      });
      if (existing) {
        this.logger.warn(
          `Snapshot ${snapshotType} existe déjà pour le bon ${bon.reference} — document signé conservé, régénération ignorée`,
        );
        return Buffer.from(existing.data);
      }
    }

    // SHA-256 du document : chaîne de preuve — permet de vérifier a posteriori
    // que le PDF archivé (DB ou partage SMB) n'a pas été altéré
    const sha256 = createHash('sha256').update(pdf).digest('hex');

    // Chaîne de preuve ATOMIQUE : l'archive probante APPEND-ONLY, le snapshot
    // « courant » (pour l'affichage) et la trace d'audit du hash sont écrits
    // dans la même transaction. Si l'une des trois écritures échoue, TOUT est
    // annulé et l'erreur remonte à l'appelant : la preuve n'est jamais
    // considérée comme archivée en cas d'échec partiel.
    await this.prisma.$transaction(async (tx) => {
      // Archive APPEND-ONLY : copie scellée immuable de CE document. Garantit
      // qu'une preuve co-signée (ex. 1re restitution partielle) ne disparaît pas
      // quand un document du même type est régénéré plus tard. Créée AVANT le
      // snapshot « courant » : c'est la preuve légale, jamais écrasée.
      await tx.proofArchive.create({
        data: { bonId: bon.id, type: snapshotType, filename, data: pdf, sha256 },
      });

      // Upsert dans PdfSnapshot (le « courant » par type, pour l'affichage)
      await tx.pdfSnapshot.upsert({
        where: { bonId_type: { bonId: bon.id, type: snapshotType as PdfSnapshotType } },
        update: { data: pdf, filename, sha256 },
        create: { bonId: bon.id, type: snapshotType as PdfSnapshotType, data: pdf, filename, sha256 },
      });

      // Trace d'audit immuable du hash — jamais avalée : un échec ici annule
      // aussi l'archive et le snapshot ci-dessus (rollback de la transaction).
      await tx.auditLog.create({
        data: {
          bonId: bon.id,
          action: 'pdf_snapshot_saved',
          details: { type: snapshotType, filename, sha256 },
        },
      });
    });

    this.logger.log(`PDF snapshot ${snapshotType} sauvegardé pour le bon ${bon.reference} (sha256=${sha256.slice(0, 12)}…)`);
    return pdf;
  }

  getDocumentType(snapshotType: string): 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' {
    if (snapshotType.includes('avenant')) return 'avenant';
    if (snapshotType.includes('restitution')) return 'restitution';
    if (snapshotType.includes('cloture')) return 'cloture';
    return 'mise_disposition';
  }

  /** Génère le PDF sans le sauvegarder (appel à la demande). */
  async generateBonPdf(
    bon: BonForPdf,
    sigImages: SigImages = { it: null, collab: null },
    documentType: 'mise_disposition' | 'restitution' | 'cloture' | 'avenant' = 'mise_disposition',
    configOverride?: PdfTemplateConfig,
  ): Promise<Buffer> {
    return this.renderPdf(bon, sigImages, documentType, configOverride);
  }

  // ─── Rendering (PDFKit) ────────────────────────────────────────────────────
  // L'assemblage du document délègue aux modules purs de `./render/*` (un
  // module par section : en-tête, parties, tableau, signatures, certificat,
  // pied de page) — voir chacun pour le détail du rendu. Cette classe garde
  // le chargement des données (Prisma, fichiers) et le choix du modèle.

  private async renderPdf(
    bon: BonForPdf,
    sigImages: SigImages,
    documentType: PdfDocumentType = 'mise_disposition',
    configOverride?: PdfTemplateConfig,
  ): Promise<Buffer> {
    // Load template config: override > custom from DB > default
    const config = configOverride ?? await this.pdfTemplatesService.getTemplateConfig(documentType);

    // Build template variables for text substitution.
    // IMPORTANT — déterminisme : le document de preuve NE DOIT PAS dépendre de
    // l'horloge murale (new Date()) ni du statut courant, sinon deux rendus du
    // même bon diffèrent et le SHA-256 ne prouve plus l'intégrité de ce que le
    // signataire a vu. DATE est ancrée sur la date métier (mise à disposition),
    // les horodatages réels des signatures figurent dans le certificat annexé.
    const filialeName = bon.filiale?.displayName || bon.filiale?.name || '';
    const templateVars: Record<string, string> = {
      FILIALE: filialeName,
      REFERENCE: bon.reference,
      DATE: formatDate(bon.dateMiseDisposition),
      TIME: '',
      COLLAB_NAME: bon.collaborateur?.displayName || '—',
      STATUS: getStatusLabel(bon.status),
    };

    const titleMap: Record<string, string> = {
      mise_disposition: `Bon de Mise à Disposition - ${bon.reference}`,
      restitution: `Bon de Restitution - ${bon.reference}`,
      cloture: `Procès-verbal d'équipements non restitués - ${bon.reference}`,
      avenant: `Avenant — Équipement(s) retrouvé(s) - ${bon.reference}`,
    };

    // Pre-load logo/stamp buffers asynchronously before synchronous PDF build
    const logoBuffer = await this.getLogoBuffer(bon.filiale?.logoPath || null);
    const stampBuffer = await this.getLogoBuffer(bon.filiale?.stampPath || null);

    // Déterminisme des métadonnées PDF : PDFKit fixe par défaut
    // info.CreationDate/ModDate à `new Date()` (horloge murale), ce qui ferait
    // varier le hash SHA-256 à chaque rendu du MÊME bon. On les ancre sur une
    // date métier stable (mise à disposition) — les horodatages réels des
    // signatures restent dans le certificat annexé, jamais dans les métadonnées.
    const anchorDate = new Date(bon.dateMiseDisposition);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: config.margins.top, bottom: config.margins.bottom, left: config.margins.left, right: config.margins.right },
        bufferPages: true,
        info: {
          Title: titleMap[documentType],
          Author: bon.createdBy?.displayName || 'Service IT',
          CreationDate: anchorDate,
          ModDate: anchorDate,
        },
      });

      // Enregistrement des polices Unicode (une fois par document — l'API
      // PDFKit registerFont() est scopée à l'instance PDFDocument)
      if (this.customFontsAvailable) {
        doc.registerFont('Body', this.fontRegularPath);
        doc.registerFont('Body-Bold', this.fontBoldPath);
      }

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.buildPdf(doc, bon, sigImages, documentType, logoBuffer, stampBuffer, config, templateVars);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private buildPdf(
    doc: PDFKit.PDFDocument,
    bon: BonForPdf,
    sigImages: SigImages,
    documentType: PdfDocumentType,
    logoBuffer: Buffer | null,
    stampBuffer: Buffer | null,
    config: PdfTemplateConfig,
    templateVars: Record<string, string>,
  ): void {
    const { colors, fonts } = config;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const civiliteLabel = bon.civilite === 'mme' ? 'Mme' : 'M.';
    const fontNames: RenderFonts = { regular: this.FONT_REGULAR, bold: this.FONT_BOLD };

    drawHeader(doc, bon, config, templateVars, fontNames, logoBuffer, leftX, pageWidth, this.logger);
    drawPartiesSection(doc, bon, config, civiliteLabel, fontNames, leftX, pageWidth);

    if (documentType === 'avenant') {
      drawAvenantNote(doc, fonts, fontNames, leftX, pageWidth);
    }

    drawEquipmentTable(doc, bon, documentType, config, templateVars, fontNames, leftX, pageWidth);

    // ─── NOTES ───────────────────────────────────────────────────────────────
    if (bon.notes) {
      doc.y += 8;
      doc.rect(leftX, doc.y, pageWidth, 1).fill(colors.border);
      doc.y += 6;
      doc.font(this.FONT_BOLD).fontSize(fonts.labelSize).fillColor(colors.lightGray).text('REMARQUES GÉNÉRALES', leftX);
      doc.y += 4;
      doc.font(this.FONT_REGULAR).fontSize(fonts.bodySize).fillColor(colors.dark).text(bon.notes, leftX, doc.y, { width: pageWidth });
      doc.y += 12;
    }

    drawSignaturesSection(
      doc, bon, sigImages, documentType, config, civiliteLabel, fontNames, leftX, pageWidth, stampBuffer, this.logger,
      (d, x, y, w, o, c) => this.drawSignatureBox(d, x, y, w, o, c),
    );

    // ─── CERTIFICAT DE SIGNATURE ÉLECTRONIQUE ────────────────────────────────
    drawCertificateSection(doc, bon, leftX, pageWidth, colors, fonts, fontNames);

    // ─── FOOTER ──────────────────────────────────────────────────────────────
    drawFooterSection(doc, config, templateVars, fontNames, leftX, pageWidth);
  }

  /** Case de signature (cadre, identité, mention, image ou placeholder, date).
   *  Conservée comme méthode d'instance (plutôt que délégation directe depuis
   *  ./render/signatures) : les specs existants espionnent explicitement
   *  cette méthode pour vérifier le non-chevauchement case IT / cachet. */
  private drawSignatureBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    opts: SignatureBoxOptions,
    colors: PdfTemplateConfig['colors'],
  ): void {
    renderSignatureBox(doc, x, y, width, opts, colors, { regular: this.FONT_REGULAR, bold: this.FONT_BOLD });
  }

  // ─── Utility methods ─────────────────────────────────────────────────────────

  /** Lit un fichier image (logo OU cachet de filiale) depuis data/uploads.
   *  Conservée comme méthode d'instance : espionnée directement par les
   *  specs (mock du chargement du cachet de filiale sans mock du disque). */
  private async getLogoBuffer(logoPath: string | null): Promise<Buffer | null> {
    if (!logoPath) return null;
    const filename = logoPath.split('/').pop() || '';
    const fullPath = join(UPLOADS_DIR, filename);
    if (!existsSync(fullPath)) return null;
    try {
      return await readFile(fullPath);
    } catch (err) {
      this.logger.warn(`Image illisible (${fullPath}) : ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Régénération des snapshots manquants ────────────────────────────────────

  /** Régénère les PdfSnapshot manquants — voir ./snapshot-regeneration.ts pour
   *  le détail (déduction du type, limites connues de l'heuristique). */
  async regenerateMissingSnapshots(): Promise<{ regenerated: number; failed: number }> {
    return regenerateMissingSnapshotsImpl({
      prisma: this.prisma,
      encryption: this.encryption,
      signaturesDir: this.signaturesDir,
      logger: this.logger,
      generateAndSave: (bon, snapshotType, sigImages, filename) =>
        this.generateAndSave(bon, snapshotType, sigImages, filename),
    });
  }
}
