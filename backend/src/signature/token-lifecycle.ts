import type { SignatureInvalidationReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { generateSignatureToken } from '../common/tokens';
import { clampTokenValidityDays, computeTokenExpiresAt } from './token';
import { LIVE_LINK_WHERE, invalidationData } from './link-invalidation';

export interface TokenLifecycleDeps {
  prisma: PrismaService;
  configService: AppConfigService;
  defaultTokenValidityDays: number;
  inPersonTokenValidityHours: number;
}

export type LinkDocumentType = 'mise_disposition' | 'restitution' | 'pv_cloture';

/** Token validity in days — admin-configurable (tokens.expiry_days), clamped to [1, 30]. */
async function getTokenValidityDays(deps: TokenLifecycleDeps): Promise<number> {
  const raw = await deps.configService.get('tokens', 'expiry_days');
  return clampTokenValidityDays(raw, deps.defaultTokenValidityDays);
}

/**
 * Crée un lien de signature du document (remise, restitution ou PV), par
 * email ou au guichet (`isInPerson`, lien de 2 h). Les liens encore vivants
 * du même document sont invalidés : « remplacé » par un nouveau lien, ou
 * « signature au guichet » quand le nouveau lien est présentiel. Un lien déjà
 * invalidé garde son premier motif.
 */
export async function generateToken(
  deps: TokenLifecycleDeps,
  bonId: string,
  type: LinkDocumentType,
  initiatedById?: string,
  isInPerson = false,
) {
  await deps.prisma.signature.updateMany({
    where: { bonId, type, ...LIVE_LINK_WHERE },
    data: invalidationData(isInPerson ? 'in_person' : 'replaced'),
  });

  // 256 bits d'entropie (homogène avec les autres secrets du projet) plutôt
  // que les 122 bits d'un UUIDv4 — c'est le token réellement signable.
  const token = generateSignatureToken();
  const tokenExpiresAt = computeTokenExpiresAt(isInPerson, {
    validityDays: await getTokenValidityDays(deps),
    inPersonValidityHours: deps.inPersonTokenValidityHours,
  });

  return deps.prisma.signature.create({
    data: {
      bonId,
      type,
      token,
      tokenExpiresAt,
      isInPerson,
      initiatedById: initiatedById ?? null,
    },
  });
}

/** Invalide tous les liens encore vivants du bon, avec leur motif (par défaut
 *  « remplacé » ; « contesté », « annulé »… selon l'appelant). */
export async function invalidateUnsignedTokens(
  deps: Pick<TokenLifecycleDeps, 'prisma'>,
  bonId: string,
  reason: SignatureInvalidationReason = 'replaced',
): Promise<void> {
  await deps.prisma.signature.updateMany({
    where: { bonId, ...LIVE_LINK_WHERE },
    data: invalidationData(reason),
  });
}
