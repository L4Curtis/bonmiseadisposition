import type { BonForPdf, SigImages, WithoutSignatureNotice } from '../pdf-types';
import type { DocumentSignatures } from '../document-signatures';
import { PdfTemplateConfig } from '../pdf-template-config';
import { PdfDocumentType, formatDate } from './layout';
import { SignerNames, signerName } from './signer-names';

// ─── Contenu des cases de signature ───────────────────────────────────────────
// Ce que chaque case affiche, calculé AVANT le dessin à partir des signatures
// du document (document-signatures.ts). Fonction pure : c'est ici que se
// décide ce qu'un document probant affirme, d'où ses tests dédiés.

export interface SignatureBoxModel {
  title: string;
  name: string;
  mention: string;
  signatureImage: string | null;
  date: string;
  /** Précision après la date (« au guichet, en présence de … »). */
  detail?: string;
  /** Texte affiché dans la zone de signature quand il n'y a pas d'image. */
  placeholder?: string;
}

export interface SignaturesModel {
  it: SignatureBoxModel;
  /** `null` pour l'avenant, attestation de l'IT seule. */
  collab: SignatureBoxModel | null;
}

export interface SignaturesModelInput {
  bon: BonForPdf;
  documentType: PdfDocumentType;
  selection: DocumentSignatures;
  images: SigImages;
  names: SignerNames;
  config: PdfTemplateConfig;
  civiliteLabel: string;
  notice?: WithoutSignatureNotice;
}

/** Date laissée en blanc quand le document n'est pas encore signé. */
export const BLANK_DATE = '_______________';

const WITHOUT_SIGNATURE_MENTIONS: Readonly<Record<WithoutSignatureNotice['kind'], string>> = Object.freeze({
  handover: 'Remise constatée sans la signature du collaborateur',
  closure: 'Clôture constatée sans la signature du collaborateur',
});

/** Motif et auteur du constat, imprimés dans la zone de signature. */
export function withoutSignaturePlaceholder(notice: WithoutSignatureNotice): string {
  // Constat déjà rédigé en texte libre (sans technicien séparé) : tel quel.
  if (!notice.actorName) return notice.reason;
  const by = notice.actorName ? `Constaté par ${notice.actorName} le ${formatDate(notice.at)}` : '';
  return [`Motif : ${notice.reason}`, by].filter(Boolean).join('\n');
}

function buildItBox({ selection, images, names, config }: SignaturesModelInput): SignatureBoxModel {
  const it = selection.it;
  return {
    title: config.signatures.itTitle,
    name: it ? signerName(names, it.signerEmail) ?? it.signerEmail ?? '—' : '—',
    mention: config.signatures.itMention,
    signatureImage: it ? images.it : null,
    date: it?.signedAt ? formatDate(it.signedAt) : BLANK_DATE,
  };
}

/** « au guichet », et le technicien présent quand il tenait la tablette. */
function inPersonDetail(input: SignaturesModelInput): string | undefined {
  const collab = input.selection.collab;
  if (!collab?.isInPerson) return undefined;
  if (!collab.signedByProxy) return 'au guichet';
  const witness = signerName(input.names, collab.signerEmail) ?? collab.signerEmail ?? 'un technicien';
  return `au guichet, en présence de ${witness}`;
}

function buildCollabBox(input: SignaturesModelInput): SignatureBoxModel {
  const { bon, selection, images, config, civiliteLabel, notice } = input;
  const base = {
    title: config.signatures.collabTitle,
    name: `${civiliteLabel} ${bon.collaborateur?.displayName || '—'}`,
  };
  if (notice) {
    return {
      ...base,
      mention: WITHOUT_SIGNATURE_MENTIONS[notice.kind],
      signatureImage: null,
      date: notice.at ? formatDate(notice.at) : BLANK_DATE,
      placeholder: withoutSignaturePlaceholder(notice),
    };
  }
  const collab = selection.collab;
  return {
    ...base,
    mention: config.signatures.collabMention,
    signatureImage: collab ? images.collab : null,
    date: collab?.signedAt ? formatDate(collab.signedAt) : BLANK_DATE,
    detail: inPersonDetail(input),
  };
}

export function buildSignaturesModel(input: SignaturesModelInput): SignaturesModel {
  return {
    it: buildItBox(input),
    collab: input.documentType === 'avenant' ? null : buildCollabBox(input),
  };
}
