import type { BonStatus, Prisma } from '@prisma/client';
import type { LinkDocumentType } from '../common/events';
import { writeAuditEntry } from '../audit/audit-record';
import type { AuditAction } from '../audit/audit-actions';

/**
 * Ce qu'une signature du collaborateur écrit au journal d'audit, et donc à
 * l'historique du bon.
 *
 * L'auteur de l'entrée est le SIGNATAIRE, tel que la signature l'établit, et
 * non le compte qui a envoyé la requête : au guichet, le collaborateur signe
 * sur l'appareil du technicien, connecté à son compte. Comme le certificat du
 * PDF, la phrase précise alors « au guichet, en présence de … ». Seul un
 * mandataire (compte ni IT ni titulaire) est l'auteur de sa signature, faite
 * « pour le compte de » du collaborateur.
 */

/** Document signé par le collaborateur → action du journal d'audit. */
const SIGNED_DOCUMENT_ACTIONS: Readonly<Record<LinkDocumentType, AuditAction>> = Object.freeze({
  mise_disposition: 'signed_mise_disposition',
  restitution: 'signed_restitution',
  pv_cloture: 'signed_pv_cloture',
});

/** Pourquoi la signature clôture le bon, dans la phrase « Le système a clôturé… ». */
const CLOSING_CAUSES: Readonly<Partial<Record<LinkDocumentType, string>>> = Object.freeze({
  restitution: 'restitution complète signée',
  pv_cloture: 'PV de non-restitution signé',
});

/** La signature telle qu'elle vient d'être enregistrée. */
export interface SignatureAuditInput {
  readonly bon: {
    readonly id: string;
    readonly collaborateurId: string;
    readonly collaborateurEmail: string | null;
    readonly collaborateur: { readonly displayName: string } | null;
  };
  readonly documentType: LinkDocumentType;
  readonly isInPerson: boolean;
  readonly signedByProxy: boolean;
  /** Au guichet, un compte autre que le titulaire tenait l'appareil. */
  readonly collectedByOtherAccount: boolean;
  /** Compte connecté qui a envoyé la signature. */
  readonly account: { readonly id?: string; readonly email: string; readonly ip: string; readonly userAgent: string };
  readonly mentionLuApprouve: boolean;
  readonly previousStatus: BonStatus;
  readonly newStatus: BonStatus;
}

/** Auteur de l'entrée et précision « au guichet… » de la phrase. */
export interface SignatureAuthor {
  readonly actorId: string | null;
  readonly actorEmail: string | null;
  readonly inPersonContext: string | null;
}

/**
 * Qui a signé, d'après la signature : à distance ou sur son propre compte, le
 * titulaire ; au guichet sur le compte d'un technicien, le titulaire « en
 * présence de » ce technicien ; par un mandataire, le mandataire « pour le
 * compte de » du titulaire. Fonction pure.
 */
export function signatureAuthor(input: SignatureAuditInput, accountName: string): SignatureAuthor {
  const { bon, account } = input;
  const holderName = bon.collaborateur?.displayName || bon.collaborateurEmail || 'le collaborateur';
  if (!input.isInPerson) return { actorId: account.id ?? null, actorEmail: account.email, inPersonContext: null };
  if (input.signedByProxy) {
    return { actorId: account.id ?? null, actorEmail: account.email, inPersonContext: `au guichet, pour le compte de ${holderName} (mandataire)` };
  }
  if (!input.collectedByOtherAccount) return { actorId: account.id ?? null, actorEmail: account.email, inPersonContext: 'au guichet' };
  return {
    actorId: bon.collaborateurId,
    actorEmail: bon.collaborateurEmail,
    inPersonContext: `au guichet, en présence de ${accountName}`,
  };
}

/** Nom affiché du compte connecté (témoin), à défaut son adresse. */
async function accountDisplayName(tx: Prisma.TransactionClient, account: SignatureAuditInput['account']): Promise<string> {
  if (!account.id) return account.email;
  const user = await tx.user.findUnique({ where: { id: account.id }, select: { displayName: true } });
  return user?.displayName || account.email;
}

/**
 * Écrit la signature au journal, puis la clôture du bon quand cette signature
 * la provoque (restitution complète, PV de non-restitution), dans la
 * transaction de la signature.
 */
export async function writeSignatureAudit(tx: Prisma.TransactionClient, input: SignatureAuditInput): Promise<void> {
  const accountName = input.collectedByOtherAccount && !input.signedByProxy ? await accountDisplayName(tx, input.account) : input.account.email;
  const author = signatureAuthor(input, accountName);
  await writeAuditEntry(tx, SIGNED_DOCUMENT_ACTIONS[input.documentType], {
    actorId: author.actorId,
    actorEmail: author.actorEmail,
    bonId: input.bon.id,
    ip: input.account.ip,
    userAgent: input.account.userAgent,
    details: {
      isInPerson: input.isInPerson,
      signedByProxy: input.signedByProxy,
      titulaireEmail: input.bon.collaborateurEmail,
      // Compte qui tenait l'appareil (témoin ou mandataire), quand ce n'est pas le titulaire.
      // L'identifiant survit à l'anonymisation, qui efface l'adresse.
      ...(input.collectedByOtherAccount ? { signerEmail: input.account.email, signerAccountId: input.account.id ?? null } : {}),
      ...(author.inPersonContext ? { inPersonContext: author.inPersonContext } : {}),
      mentionLuApprouve: input.mentionLuApprouve,
      newStatus: input.newStatus,
    },
  });
  if (input.newStatus === 'archived' && input.previousStatus !== 'archived') {
    const cause = CLOSING_CAUSES[input.documentType];
    await writeAuditEntry(tx, 'bon_closed', { bonId: input.bon.id, details: cause ? { cause } : {} });
  }
}
