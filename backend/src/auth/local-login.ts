import { Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './utils/normalize-email.util';
import { computeMustChangePassword, PasswordPolicyUser } from './password-policy';
import { AccountLockedException } from './exceptions';

// Pre-computed hash to equalize timing between "unknown user" and "wrong password"
// (prevents user enumeration through bcrypt timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer-dummy-password', 12);

export interface LocalLoginDeps {
  prisma: PrismaService;
  logger: Logger;
  createTokens: (user: {
    id: string;
    email: string | null;
    role: string;
  }) => Promise<{ accessToken: string; refreshToken: string }>;
}

type LocalUser = PasswordPolicyUser & {
  id: string;
  // Optionnel en base depuis l'arrivée des collaborateurs créés à la main ;
  // un compte local authentifiable en a toujours une (filtre de la requête).
  email: string | null;
  role: string;
  passwordHash: string | null;
};

// ─── Brute-force protection (persistent via AuditLog, survives restarts) ─
// Deux dimensions indépendantes (LOT C bug #2) :
//  - verrou par COMPTE : ≥10 échecs pour (email, IP) en 30 min. Sans la
//    dimension IP, n'importe qui pouvait verrouiller admin@local (compte de
//    secours) depuis n'importe où en renvoyant juste le bon email.
//  - verrou par IP : ≥30 échecs depuis une même IP en 30 min, toutes cibles
//    confondues — bloque le credential-stuffing qui teste beaucoup d'emails
//    différents depuis une seule IP (ce que le verrou par compte ne couvre pas).
// Failed login audit entries are recorded by the controller after this check;
// lockout rejections are logged as login_local_locked (not counted here) so
// that probing a locked account cannot extend the lockout indefinitely.
async function checkBruteForce(deps: Pick<LocalLoginDeps, 'prisma' | 'logger'>, email: string, ip: string): Promise<void> {
  const windowStart = new Date(Date.now() - 30 * 60 * 1000); // 30-min window
  const [accountFailures, ipFailures] = await Promise.all([
    deps.prisma.auditLog.count({
      where: { userEmail: email, ipAddress: ip, action: 'login_local_failed', createdAt: { gte: windowStart } },
    }),
    deps.prisma.auditLog.count({
      where: { ipAddress: ip, action: 'login_local_failed', createdAt: { gte: windowStart } },
    }),
  ]);
  if (accountFailures >= 10) {
    deps.logger.warn(`Compte ${email} bloqué depuis l'IP ${ip} (${accountFailures} échecs en 30 min)`);
    throw new AccountLockedException('Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans 30 minutes.');
  }
  if (ipFailures >= 30) {
    deps.logger.warn(`IP ${ip} bloquée (${ipFailures} échecs toutes cibles confondues en 30 min)`);
    throw new AccountLockedException('Trop de tentatives depuis votre adresse. Réessayez dans 30 minutes.');
  }
}

/** Extrait de AuthService.localLogin sans changement de comportement. */
export async function localLogin(
  deps: LocalLoginDeps,
  email: string,
  password: string,
  ip: string,
): Promise<{ accessToken: string; refreshToken: string; mustChangePassword: boolean }> {
  const normalizedEmail = normalizeEmail(email);
  // Check brute-force lock (persistent, survives restarts)
  await checkBruteForce(deps, normalizedEmail, ip);

  const user: LocalUser | null = await deps.prisma.user.findFirst({
    where: { email: normalizedEmail, isLocalAccount: true, active: true },
  });

  if (!user || !user.passwordHash) {
    // Equalize timing with the existing-user path (anti user-enumeration)
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new UnauthorizedException('Identifiants incorrects');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedException('Identifiants incorrects');
  }

  const tokens = await deps.createTokens(user);
  return { ...tokens, mustChangePassword: computeMustChangePassword(user) };
}
