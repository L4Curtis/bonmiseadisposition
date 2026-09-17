import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { generateSignatureToken } from '../common/tokens';
import { clampTokenValidityDays, computeTokenExpiresAt } from './token';

export interface TokenLifecycleDeps {
  prisma: PrismaService;
  configService: AppConfigService;
  defaultTokenValidityDays: number;
  inPersonTokenValidityHours: number;
}

/** Token validity in days — admin-configurable (tokens.expiry_days), clamped to [1, 30]. */
async function getTokenValidityDays(deps: TokenLifecycleDeps): Promise<number> {
  const raw = await deps.configService.get('tokens', 'expiry_days');
  return clampTokenValidityDays(raw, deps.defaultTokenValidityDays);
}

/**
 * Generate a signature token for a bon (mise_disposition, restitution, or pv_cloture).
 * Extrait de SignatureService.generateToken sans changement de comportement.
 */
export async function generateToken(
  deps: TokenLifecycleDeps,
  bonId: string,
  type: 'mise_disposition' | 'restitution' | 'pv_cloture',
  initiatedById?: string,
  isInPerson = false,
) {
  // Invalidate previous unsigned tokens of same type
  await deps.prisma.signature.updateMany({
    where: { bonId, type, signed: false },
    data: { tokenExpiresAt: new Date(0) }, // expire immediately
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

/** Invalidate all unsigned tokens for a bon (used when bon enters contested state) */
export async function invalidateUnsignedTokens(deps: Pick<TokenLifecycleDeps, 'prisma'>, bonId: string): Promise<void> {
  await deps.prisma.signature.updateMany({
    where: { bonId, signed: false, tokenExpiresAt: { gt: new Date(1000) } },
    data: { tokenExpiresAt: new Date(0) },
  });
}
