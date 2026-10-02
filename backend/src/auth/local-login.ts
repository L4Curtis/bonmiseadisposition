import { Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './utils/normalize-email.util';
import { computeMustChangePassword, PasswordPolicyUser } from './password-policy';
import { AccountLockedException } from './exceptions';
import { ACCOUNT_LOCK_THRESHOLD, LOGIN_LOCK_WINDOW_MS, STATION_LOCK_THRESHOLD, lockWindowStart } from '../audit/login-lock';

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

// ─── Protection anti force brute (déduite du journal, survit aux redémarrages)
// Deux dimensions indépendantes :
//  - verrou par COMPTE : ≥ACCOUNT_LOCK_THRESHOLD (10) échecs pour (email, IP) en 30 min, comptés
//    depuis le dernier déverrouillage par l'administrateur s'il est plus
//    récent (audit/login-lock.ts : le déverrouillage n'efface rien du
//    journal). Sans la dimension IP, n'importe qui pouvait verrouiller
//    admin@local (compte de secours) depuis n'importe où avec le bon email.
//  - verrou par IP : ≥STATION_LOCK_THRESHOLD (30) échecs depuis une même IP en 30 min, toutes cibles
//    confondues — bloque le credential-stuffing qui teste beaucoup d'emails
//    différents depuis une seule IP (ce que le verrou par compte ne couvre pas).
// Failed login audit entries are recorded by the controller after this check;
// Mêmes seuils que l'état affiché dans l'écran Utilisateurs (audit/login-lock.ts).
// lockout rejections are logged as login_local_locked (not counted here) so
// that probing a locked account cannot extend the lockout indefinitely.
async function checkBruteForce(deps: Pick<LocalLoginDeps, 'prisma' | 'logger'>, email: string, ip: string): Promise<void> {
  const now = new Date();
  const ipWindowStart = new Date(now.getTime() - LOGIN_LOCK_WINDOW_MS);
  const accountWindowStart = await lockWindowStart(deps.prisma, email, now);
  const [accountFailures, ipFailures] = await Promise.all([
    deps.prisma.auditLog.count({
      where: { userEmail: email, ipAddress: ip, action: 'login_local_failed', createdAt: { gte: accountWindowStart } },
    }),
    deps.prisma.auditLog.count({
      where: { ipAddress: ip, action: 'login_local_failed', createdAt: { gte: ipWindowStart } },
    }),
  ]);
  if (accountFailures >= ACCOUNT_LOCK_THRESHOLD) {
    deps.logger.warn(`Compte ${email} bloqué depuis l'IP ${ip} (${accountFailures} échecs en 30 min)`);
    throw new AccountLockedException();
  }
  if (ipFailures >= STATION_LOCK_THRESHOLD) {
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
