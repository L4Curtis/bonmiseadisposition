import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, SignatureInvalidationReason } from '@prisma/client';
import type { LinkSignatureType } from '../../contracts/bons';
import { assertCanSendLink } from '../../common/can-send-link';
import { BON_REFERENCE_TX_OPTIONS } from '../../common/bon-reference';
import { generateSignatureToken } from '../../common/tokens';
import { NotificationBon } from '../../common/types';
import { BonsWorkflowContext, getPvTokenValidityDays } from './bon-context';
import { FactsBon, isItSignedFor, isValidLink } from './bon-facts';

/**
 * Liens de signature du collaborateur : invalidation motivée, émission par
 * email ou au guichet. Tous les chemins qui donnent un lien passent ici, et
 * appliquent donc les mêmes règles :
 *  - un email ne part que si `canSendLink` l'autorise (compte actif, adresse
 *    délivrable), à l'adresse ACTUELLE du compte (R-004, R-008, R-009) ;
 *  - aucun lien ne part sans la signature IT du document (R-022) ;
 *  - tout lien remplacé est invalidé avec son motif (R-038) ;
 *  - deux liens valides ne coexistent jamais : toute émission de lien
 *    est sérialisée par bon (`lockBonLinks`), et un double clic ne produit
 *    qu'un envoi.
 */

/** Un lien invalidé a son échéance ramenée à l'epoch : tout ce qui est au-delà
 *  d'une seconde est encore un lien « vivant » (valide ou expiré). */
const INVALIDATED_TOKEN_SENTINEL = new Date(1000);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Client Prisma ou transaction en cours. */
type Db = Pick<Prisma.TransactionClient, 'signature'>;

/** Invalide les liens non signés du bon (hors signature IT), avec le motif.
 *  `types` restreint à certains documents. Renvoie le nombre de liens invalidés. */
export async function invalidatePendingLinks(
  db: Db,
  bonId: string,
  reason: SignatureInvalidationReason,
  types?: readonly LinkSignatureType[],
): Promise<number> {
  const now = new Date();
  const result = await db.signature.updateMany({
    where: {
      bonId,
      signed: false,
      type: types ? { in: [...types] } : { not: 'it_cachet' },
      tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
    },
    data: { tokenExpiresAt: new Date(0), invalidatedAt: now, invalidatedReason: reason },
  });
  return result.count;
}

/** Retire la valeur des signatures IT d'un document dont le contenu a changé
 *  (bon modifié, marquage « rendu » annulé) : une nouvelle signature IT sera
 *  exigée avant le prochain lien. La signature reste en base, datée.
 *
 *  Pour une restitution, seule la demande EN COURS est touchée : les
 *  signatures IT posées avant la dernière restitution signée par le
 *  collaborateur appartiennent à des documents déjà conclus, qui restent
 *  probants (`signedRestitutionAt`, 0 si aucune restitution n'est signée). */
export async function invalidateItSignatures(
  db: Db,
  bonId: string,
  document: 'mise_disposition' | 'restitution',
  reason: SignatureInvalidationReason,
  signedRestitutionAt = 0,
): Promise<void> {
  const scope =
    document === 'mise_disposition'
      ? { OR: [{ pdfType: document }, { pdfType: null }] }
      : { pdfType: document, signedAt: { gt: new Date(signedRestitutionAt) } };
  await db.signature.updateMany({
    where: { bonId, type: 'it_cachet', signed: true, invalidatedAt: null, ...scope },
    data: { invalidatedAt: new Date(), invalidatedReason: reason },
  });
}

/** Refuse un lien pour un document dont la signature IT manque (R-022). */
export function assertItSigned(bon: FactsBon, document: LinkSignatureType): void {
  if (!isItSignedFor(bon, document)) {
    throw new BadRequestException(
      'La signature IT de ce document est requise avant de transmettre le lien au collaborateur.',
    );
  }
}

/** Bon lu par les émetteurs de lien : faits de la machine à états + ce que
 *  les emails affichent. */
export type LinkBon = FactsBon & NotificationBon & { id: string; collaborateur: { active: boolean; email: string | null } };

/** Envoie la demande de signature du document (email du bon), sans attendre. */
function sendRequestEmail(ctx: BonsWorkflowContext, bon: NotificationBon, document: LinkSignatureType, token: string) {
  const { notificationService, logger } = ctx;
  const send =
    document === 'mise_disposition'
      ? notificationService.sendMiseDispositionRequest(bon, token)
      : document === 'restitution'
        ? notificationService.sendRestitutionRequest(bon, token)
        : notificationService.sendPvClotureRequest(bon, token);
  send.catch((err: unknown) => logger.error(`Email de demande de signature (${bon.reference}) : ${String(err)}`));
}

/** Deux demandes d'envoi du même document à moins de ce délai (double clic
 *  sur « Renvoyer », relance groupée lancée deux fois) ne font qu'un envoi. */
export const DUPLICATE_SEND_WINDOW_MS = 30 * 1000;

/** Lien remis par un émetteur : `reused` quand l'envoi précédent, tout
 *  récent, a été réutilisé au lieu d'en créer un autre (aucun email). */
export interface IssuedLink {
  token: string;
  reused: boolean;
}

export interface EmailLinkOptions {
  /** « Renvoyer » non confirmé : refuse (409 `token_recent`) si un lien
   *  encore valide a été envoyé depuis moins de ce délai. */
  refuseRecentWithinMs?: number;
}

/** Sérialise, pour un bon, tout ce qui émet un lien (email, guichet, PV de
 *  non-restitution) : deux demandes simultanées se suivent, la seconde voit
 *  le lien créé par la première. À appeler dans la transaction qui écrit. */
export async function lockBonLinks(tx: Prisma.TransactionClient, bonId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('signature_links:' || ${bonId}::text))`;
}

/** Dernier lien encore valide du collaborateur (tous documents confondus). */
function latestValidLink(tx: Prisma.TransactionClient, bonId: string) {
  return tx.signature.findFirst({
    where: { bonId, signed: false, type: { not: 'it_cachet' }, invalidatedAt: null, tokenExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Sous verrou, dans une seule transaction : refuse un renvoi non confirmé
 * trop proche (409), ou réutilise l'envoi du même document fait à l'instant,
 * ou invalide les liens en attente (« remplacé ») PUIS crée le nouveau. Deux
 * liens valides ne coexistent donc jamais pour le bon.
 */
function claimEmailLink(
  ctx: BonsWorkflowContext,
  bonId: string,
  document: LinkSignatureType,
  actorId: string | null,
  options: EmailLinkOptions & { validityDays: number },
): Promise<IssuedLink> {
  return ctx.prisma.$transaction(async (tx) => {
    await lockBonLinks(tx, bonId);
    const live = await latestValidLink(tx, bonId);
    const age = live ? Date.now() - live.createdAt.getTime() : Infinity;
    if (live && options.refuseRecentWithinMs !== undefined && age < options.refuseRecentWithinMs) {
      throw new ConflictException({ code: 'token_recent', sentAt: live.createdAt.toISOString() });
    }
    if (live && live.type === document && !live.isInPerson && age < DUPLICATE_SEND_WINDOW_MS) {
      return { token: live.token, reused: true };
    }
    await invalidatePendingLinks(tx, bonId, 'replaced');
    const created = await tx.signature.create({
      data: {
        bonId,
        type: document,
        token: generateSignatureToken(),
        tokenExpiresAt: new Date(Date.now() + options.validityDays * DAY_MS),
        isInPerson: false,
        initiatedById: actorId,
      },
    });
    return { token: created.token, reused: false };
  }, BON_REFERENCE_TX_OPTIONS);
}

/**
 * Émet un lien du document par email : contrôle d'envoi, signature IT, puis
 * (sous verrou, atomiquement) invalidation des liens précédents (« remplacé »)
 * et création du nouveau ; enfin l'email, à l'adresse actuelle du compte.
 * Une seconde demande rapprochée réutilise le lien qui vient de partir, sans
 * nouvel email.
 */
export async function issueEmailLink(
  ctx: BonsWorkflowContext,
  bon: LinkBon,
  document: LinkSignatureType,
  actorId: string | null,
  options: EmailLinkOptions = {},
): Promise<IssuedLink> {
  const email = assertCanSendLink(bon.collaborateur);
  assertItSigned(bon, document);
  const validityDays = await getPvTokenValidityDays(ctx);
  const issued = await claimEmailLink(ctx, bon.id, document, actorId, { ...options, validityDays });
  if (!issued.reused) sendRequestEmail(ctx, { ...bon, collaborateurEmail: email }, document, issued.token);
  return issued;
}

/** Validité d'un lien au guichet : même durée que SignatureService
 *  (IN_PERSON_TOKEN_VALIDITY_HOURS), le temps de la présence au guichet. */
const IN_PERSON_LINK_VALIDITY_MS = 2 * 60 * 60 * 1000;

/**
 * Lien de signature au guichet (2 h) du document : réutilise le lien
 * présentiel encore valide (fenêtre rouverte), sinon invalide les liens en
 * attente (« signature au guichet ») et en crée un. Aucun email. Sous le même
 * verrou que l'émission par email, dans une seule transaction : un renvoi
 * simultané ne laisse jamais deux liens valides.
 */
export async function issueInPersonLink(
  ctx: BonsWorkflowContext,
  bon: LinkBon,
  document: LinkSignatureType,
  actorId: string,
): Promise<string> {
  assertItSigned(bon, document);
  return ctx.prisma.$transaction(async (tx) => {
    await lockBonLinks(tx, bon.id);
    const now = Date.now();
    const reusable = await tx.signature.findFirst({
      where: { bonId: bon.id, type: document, isInPerson: true, signed: false, invalidatedAt: null, tokenExpiresAt: { gt: new Date(now) } },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable && isValidLink(reusable, now)) return reusable.token;
    await invalidatePendingLinks(tx, bon.id, 'in_person');
    const created = await tx.signature.create({
      data: {
        bonId: bon.id,
        type: document,
        token: generateSignatureToken(),
        tokenExpiresAt: new Date(now + IN_PERSON_LINK_VALIDITY_MS),
        isInPerson: true,
        initiatedById: actorId,
      },
    });
    return created.token;
  }, BON_REFERENCE_TX_OPTIONS);
}
