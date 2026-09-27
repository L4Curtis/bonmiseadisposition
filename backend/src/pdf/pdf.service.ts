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
import type { PdfSnapshotType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../config/encryption.service';
import { PdfTemplatesService } from './pdf-templates.service';
import { PdfTemplateConfig } from './pdf-template-config';
import { regenerateMissingSnapshots as regenerateMissingSnapshotsImpl } from './snapshot-regeneration';
import { PdfDocumentType, RenderFonts, formatDate, getStatusLabel } from './render/layout';
import { drawHeader } from './render/header';
import { drawPartiesSection } from './render/parties';
import { drawEquipmentTable, drawAvenantNote } from './render/equipment-table';
import { drawSignaturesSection, renderSignatureBox } from './render/signatures';
import { RestitutionGroups, groupRestitutionEquipments, restitutionWindow } from './render/restitution-scope';
import { SignatureBoxModel, buildSignaturesModel } from './render/signature-model';
import { buildCertificateEntries, drawCertificateSection } from './render/certificate';
import { drawFooterSection } from './render/footer';
import { DocumentSignatures, selectDocumentSignatures } from './document-signatures';
import { loadDocumentSignatureImages } from './signature-images';
import { loadSignerNames, loadStampPath } from './render-data';
import { COLLAB_SIGNED_SNAPSHOT_TYPES, DocumentRendering, resolveSnapshotRendering } from './snapshot-rendering';
import { findSameDocument, isDuplicateDocument, proofSignatureId } from './snapshot-store';
import { CIVILITE_LABELS } from '../bons/bon-status';
import { SIGNATURES_DIR, UPLOADS_DIR } from '../common/storage-paths';
import type { BonForPdf, SigImages } from './pdf-types';

export type { BonForPdf, SigImages, PdfSignature, WithoutSignatureNotice } from './pdf-types';

/** Tout ce que le dessin d'un document utilise, chargé avant le rendu. */
interface PreparedDocument {
  config: PdfTemplateConfig;
  rendering: DocumentRendering;
  selection: DocumentSignatures;
  model: ReturnType<typeof buildSignaturesModel>;
  certificate: ReturnType<typeof buildCertificateEntries>;
  logoBuffer: Buffer | null;
  stampBuffer: Buffer | null;
  /** Document de restitution : ce qu'il couvre, le cumul, ce qui reste. */
  restitution?: RestitutionGroups;
}

const MAX_PDF_SIZE = 10 * 1024 * 1024;

/** Document enregistré (ou retrouvé, s'il l'était déjà pour cette signature). */
export interface SavedDocument {
  pdf: Buffer;
  /** Nom sous lequel le document est conservé. */
  filename: string;
  /** `false` : le document de cette signature existait déjà. */
  created: boolean;
}

interface DocumentToSave {
  type: PdfSnapshotType;
  filename: string;
  signatureId: string | null;
  /** SHA-256 hex du PDF : vérifie a posteriori que le document archivé
   *  (base ou partage SMB) n'a pas été altéré. */
  sha256: string;
}

const TITLES: Readonly<Record<PdfDocumentType, string>> = Object.freeze({
  mise_disposition: 'Bon de mise à disposition',
  restitution: 'Bon de restitution',
  cloture: 'PV de non-restitution',
  avenant: 'Avenant — équipement(s) retrouvé(s)',
});

/** Date d'émission imprimée : la remise pour son document ; pour un geste
 *  sans signature, la date du constat ; pour les autres, la signature la plus
 *  récente du document (collaborateur, sinon IT). */
function documentIssueDate(bon: BonForPdf, prepared: Pick<PreparedDocument, 'rendering' | 'selection'>): Date | string {
  if (prepared.rendering.documentType === 'mise_disposition') return bon.dateMiseDisposition;
  if (prepared.rendering.notice?.at) return prepared.rendering.notice.at;
  const { collab, it } = prepared.selection;
  return collab?.signedAt ?? it?.signedAt ?? bon.dateMiseDisposition;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  // ─── Polices Unicode embarquées ─────────────────────────────────────────────
  // Les polices AFM standard de PDFKit (Helvetica…) n'encodent que Latin-1 :
  // tout caractère hors de ce jeu est rendu en glyphe faux. Sur un document de
  // preuve (identité du signataire), c'est inacceptable : DejaVu Sans (licence
  // libre) est embarquée. __dirname résout en dev (backend/src/pdf) comme en
  // prod (dist/pdf, copié par compilerOptions.assets de nest-cli.json).
  private readonly fontsDir = join(__dirname, 'fonts');
  private readonly fontRegularPath = join(this.fontsDir, 'DejaVuSans.ttf');
  private readonly fontBoldPath = join(this.fontsDir, 'DejaVuSans-Bold.ttf');
  private readonly customFontsAvailable: boolean =
    existsSync(this.fontRegularPath) && existsSync(this.fontBoldPath);

  private readonly FONT_REGULAR: string = this.customFontsAvailable ? 'Body' : 'Helvetica';
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
   * Génère le PDF d'un document du bon et l'enregistre (archive probante,
   * document listé sur la fiche, trace du hash). Renvoie le PDF.
   * Voir `saveDocument` pour la règle d'historique.
   */
  async generateAndSave(
    bon: BonForPdf,
    snapshotType: string,
    _sigImages: SigImages | null,
    filename: string,
  ): Promise<Buffer> {
    return (await this.saveDocument(bon, snapshotType, filename)).pdf;
  }

  /**
   * Génère et enregistre le document d'un type, et dit sous quel nom il est
   * conservé.
   *
   * Le document montre les signatures de CE document, lues par le PDF
   * lui-même. Un geste sans signature (`_withoutSignature`, ou l'ancien
   * `_unilateralNote`) est rangé sous `remise_sans_signature` /
   * `cloture_sans_signature`, et un document « signature du collaborateur »
   * exige que le collaborateur ait signé ce document (R-031).
   *
   * Historique : un document par signature et par contenu, jamais écrasé.
   * Deux restitutions, la remise signée de nouveau après une modification, ou
   * le PV réémis avec la même signature IT, donnent deux documents, chacun
   * avec sa date et son empreinte. Un document identique (même signature,
   * même empreinte) n'est enregistré qu'une fois : un second appel (double
   * clic, régénération) renvoie celui déjà enregistré (`created: false`).
   */
  async saveDocument(bon: BonForPdf, snapshotType: string, filename: string): Promise<SavedDocument> {
    const { snapshotType: type, rendering } = resolveSnapshotRendering(bon, snapshotType);
    const prepared = await this.prepareDocument(bon, rendering);
    if (COLLAB_SIGNED_SNAPSHOT_TYPES.includes(type) && !prepared.selection.collab) {
      throw new Error(`Le collaborateur n'a pas signé ce document : aucun PDF « ${type} » n'est produit pour le bon ${bon.reference}`);
    }
    const signatureId = proofSignatureId(rendering, prepared.selection);
    const pdf = await this.renderPdf(bon, prepared);
    if (pdf.length > MAX_PDF_SIZE) {
      throw new Error(`PDF trop volumineux (${(pdf.length / 1024 / 1024).toFixed(1)} MB > 10 MB) pour le bon ${bon.reference}`);
    }
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const existing = await findSameDocument(this.prisma, bon.id, type, signatureId, sha256);
    if (existing) {
      this.logger.warn(`Document ${type} identique déjà enregistré pour le bon ${bon.reference} — conservé tel quel`);
      return { pdf: Buffer.from(existing.data), filename: existing.filename, created: false };
    }
    try {
      await this.saveProof(bon, { type, filename, signatureId, sha256 }, pdf);
    } catch (err) {
      const concurrent = isDuplicateDocument(err) ? await findSameDocument(this.prisma, bon.id, type, signatureId, sha256) : null;
      if (!concurrent) throw err;
      return { pdf: Buffer.from(concurrent.data), filename: concurrent.filename, created: false };
    }
    return { pdf, filename, created: true };
  }

  /**
   * Chaîne de preuve ATOMIQUE : archive probante APPEND-ONLY, document listé
   * (une ligne de plus, jamais une mise à jour) et trace d'audit du hash dans
   * la même transaction. Un échec annule tout et remonte à l'appelant : la
   * preuve n'est jamais considérée comme archivée en cas d'échec partiel.
   * L'empreinte tracée dans l'audit est donc toujours celle d'un document
   * téléchargeable.
   */
  private async saveProof(bon: BonForPdf, document: DocumentToSave, pdf: Buffer): Promise<void> {
    const { type, filename, signatureId, sha256 } = document;
    await this.prisma.$transaction(async (tx) => {
      await tx.proofArchive.create({ data: { bonId: bon.id, type, filename, data: pdf, sha256 } });
      const snapshot = await tx.pdfSnapshot.create({
        data: { bonId: bon.id, type, data: pdf, filename, sha256, signatureId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          bonId: bon.id,
          action: 'pdf_snapshot_saved',
          details: { type, filename, sha256, snapshotId: snapshot.id, signatureId },
        },
      });
    });
    this.logger.log(`PDF snapshot ${type} sauvegardé pour le bon ${bon.reference} (sha256=${sha256.slice(0, 12)}…)`);
  }

  /** Modèle de document d'un type enregistré (sans tenir compte d'un constat). */
  getDocumentType(snapshotType: string): PdfDocumentType {
    if (snapshotType.includes('avenant')) return 'avenant';
    if (snapshotType === 'remise_sans_signature') return 'mise_disposition';
    if (snapshotType.includes('restitution')) return 'restitution';
    if (snapshotType.includes('cloture')) return 'cloture';
    return 'mise_disposition';
  }

  /**
   * Génère le PDF sans l'enregistrer (téléchargement à la volée, aperçu avant
   * signature, aperçu d'un modèle). La case collaborateur porte sa signature
   * de ce document s'il l'a déjà signé. `_sigImages` n'est plus lu.
   */
  async generateBonPdf(
    bon: BonForPdf,
    _sigImages: SigImages | null = null,
    documentType: PdfDocumentType = 'mise_disposition',
    configOverride?: PdfTemplateConfig,
  ): Promise<Buffer> {
    const prepared = await this.prepareDocument(bon, { documentType, collab: 'document' }, configOverride);
    return this.renderPdf(bon, prepared);
  }

  // ─── Préparation : tout ce qui se lit avant de dessiner ─────────────────────

  private async prepareDocument(
    bon: BonForPdf,
    rendering: DocumentRendering,
    configOverride?: PdfTemplateConfig,
  ): Promise<PreparedDocument> {
    const config = configOverride ?? (await this.pdfTemplatesService.getTemplateConfig(rendering.documentType));
    const selection = selectDocumentSignatures(bon.signatures ?? [], rendering.documentType, rendering.collab);
    const [images, names, stampPath, logoBuffer] = await Promise.all([
      loadDocumentSignatureImages({ encryption: this.encryption, signaturesDir: this.signaturesDir }, selection),
      loadSignerNames(this.prisma, selection),
      loadStampPath(this.prisma, bon.filialeId),
      this.getLogoBuffer(bon.filiale?.logoPath || null),
    ]);
    const model = buildSignaturesModel({
      bon,
      documentType: rendering.documentType,
      selection,
      images,
      names,
      config,
      civiliteLabel: this.civiliteLabel(bon),
      notice: rendering.notice,
    });
    return {
      config,
      rendering,
      selection,
      model,
      certificate: buildCertificateEntries(bon, selection, names),
      restitution: rendering.documentType === 'restitution'
        ? groupRestitutionEquipments(bon.equipments ?? [], restitutionWindow(bon.signatures ?? [], selection.collab))
        : undefined,
      logoBuffer,
      stampBuffer: await this.getLogoBuffer(stampPath),
    };
  }

  private civiliteLabel(bon: BonForPdf): string {
    return CIVILITE_LABELS[bon.civilite as keyof typeof CIVILITE_LABELS] ?? '';
  }

  // ─── Rendu (PDFKit) ──────────────────────────────────────────────────────────
  // Chaque section est dessinée par un module pur de `./render/*`.

  private renderPdf(bon: BonForPdf, prepared: PreparedDocument): Promise<Buffer> {
    const { config, rendering } = prepared;
    // IMPORTANT — déterminisme : le document de preuve NE DOIT PAS dépendre de
    // l'horloge murale ni du statut courant, sinon deux rendus du même bon
    // diffèrent et le SHA-256 ne prouve plus rien. DATE est ancrée sur une
    // date métier : la remise pour son document, la signature du document
    // pour les autres (une restitution n'est pas « émise » le jour de la
    // remise). Les horodatages réels sont au certificat.
    const issuedOn = documentIssueDate(bon, prepared);
    const templateVars: Record<string, string> = {
      FILIALE: bon.filiale?.displayName || bon.filiale?.name || '',
      REFERENCE: bon.reference,
      DATE: formatDate(issuedOn),
      TIME: '',
      COLLAB_NAME: bon.collaborateur?.displayName || '—',
      STATUS: getStatusLabel(bon.status),
    };
    // Métadonnées ancrées elles aussi sur la date métier (PDFKit y mettrait
    // l'horloge murale, et le hash varierait à chaque rendu).
    const anchorDate = new Date(issuedOn);
    const title = rendering.titleSuffix ? `${TITLES[rendering.documentType]} — ${rendering.titleSuffix}` : TITLES[rendering.documentType];

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { ...config.margins },
        bufferPages: true,
        info: { Title: `${title} - ${bon.reference}`, Author: 'Équipe informatique', CreationDate: anchorDate, ModDate: anchorDate },
      });
      if (this.customFontsAvailable) {
        doc.registerFont('Body', this.fontRegularPath);
        doc.registerFont('Body-Bold', this.fontBoldPath);
      }
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        this.buildPdf(doc, bon, prepared, templateVars);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private buildPdf(doc: PDFKit.PDFDocument, bon: BonForPdf, prepared: PreparedDocument, templateVars: Record<string, string>): void {
    const { rendering, logoBuffer, stampBuffer } = prepared;
    const config = this.withTitleSuffix(prepared.config, rendering.titleSuffix);
    const { colors, fonts } = config;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const fontNames: RenderFonts = { regular: this.FONT_REGULAR, bold: this.FONT_BOLD };

    drawHeader(doc, bon, config, templateVars, fontNames, logoBuffer, leftX, pageWidth, this.logger);
    drawPartiesSection(doc, bon, config, this.civiliteLabel(bon), fontNames, leftX, pageWidth);
    if (rendering.documentType === 'avenant') drawAvenantNote(doc, fonts, fontNames, leftX, pageWidth);
    drawEquipmentTable(doc, bon, rendering.documentType, config, templateVars, fontNames, leftX, pageWidth, prepared.restitution);
    this.drawNotes(doc, bon, config, fontNames, leftX, pageWidth);
    drawSignaturesSection(
      doc, prepared.model, config, fontNames, leftX, pageWidth, stampBuffer, this.logger,
      (d, x, y, w, o, c) => this.drawSignatureBox(d, x, y, w, o, c),
    );
    drawCertificateSection(doc, bon.reference, prepared.certificate, leftX, pageWidth, colors, fonts, fontNames);
    drawFooterSection(doc, config, templateVars, fontNames, leftX, pageWidth);
  }

  /** Titre complété pour un geste sans signature (« … — CLÔTURÉ SANS SIGNATURE »). */
  private withTitleSuffix(config: PdfTemplateConfig, suffix: string | undefined): PdfTemplateConfig {
    if (!suffix) return config;
    return { ...config, header: { ...config.header, titleText: `${config.header.titleText} — ${suffix}` } };
  }

  /** « Remarques sur le bon » : visibles par le collaborateur, imprimées. */
  private drawNotes(
    doc: PDFKit.PDFDocument,
    bon: BonForPdf,
    config: PdfTemplateConfig,
    fontNames: RenderFonts,
    leftX: number,
    pageWidth: number,
  ): void {
    if (!bon.notes) return;
    const { colors, fonts } = config;
    doc.y += 8;
    doc.rect(leftX, doc.y, pageWidth, 1).fill(colors.border);
    doc.y += 6;
    doc.font(fontNames.bold).fontSize(fonts.labelSize).fillColor(colors.lightGray).text('REMARQUES SUR LE BON', leftX);
    doc.y += 4;
    doc.font(fontNames.regular).fontSize(fonts.bodySize).fillColor(colors.dark).text(bon.notes, leftX, doc.y, { width: pageWidth });
    doc.y += 12;
  }

  /** Case de signature. Méthode d'instance (plutôt que délégation directe) :
   *  les specs l'espionnent pour vérifier le non-chevauchement case IT / cachet. */
  private drawSignatureBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    opts: SignatureBoxModel,
    colors: PdfTemplateConfig['colors'],
  ): void {
    renderSignatureBox(doc, x, y, width, opts, colors, { regular: this.FONT_REGULAR, bold: this.FONT_BOLD });
  }

  // ─── Utilitaires ─────────────────────────────────────────────────────────────

  /** Lit un fichier image (logo OU cachet de filiale) depuis data/uploads.
   *  Méthode d'instance : espionnée par les specs (chargement du cachet sans
   *  toucher au disque). */
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

  /** Régénère les PdfSnapshot manquants — voir ./snapshot-regeneration.ts. */
  async regenerateMissingSnapshots(): Promise<{ regenerated: number; failed: number }> {
    return regenerateMissingSnapshotsImpl({
      prisma: this.prisma,
      logger: this.logger,
      generateAndSave: (bon, snapshotType, filename) => this.generateAndSave(bon, snapshotType, null, filename),
    });
  }
}
