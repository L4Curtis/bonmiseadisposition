import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { INITIAL_ADMIN_PASSWORD_FILE } from '../common/storage-paths';
import { normalizeEmail } from './utils/normalize-email.util';

export const ADMIN_LOCAL_EMAIL = normalizeEmail('admin@local');

export interface AdminProvisioningDeps {
  prisma: PrismaService;
  configService: AppConfigService;
  logger: Logger;
}

/** Supprime data/initial-admin-password.txt après le premier changement de
 *  mot de passe réussi de admin@local — le fichier ne doit pas traîner
 *  indéfiniment sur le disque une fois le mot de passe temporaire consommé. */
export function deleteInitialAdminPasswordFile(deps: Pick<AdminProvisioningDeps, 'logger'>): void {
  const filePath = INITIAL_ADMIN_PASSWORD_FILE;
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      deps.logger.log(`${filePath} supprimé après changement du mot de passe admin@local`);
    }
  } catch (err) {
    deps.logger.error(`Impossible de supprimer ${filePath}: ${(err as Error).message}`);
  }
}

function generateDefaultAdminPassword(): string {
  return process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
}

/** Write the generated admin password to a restricted file instead of logging
 *  it in clear text (container logs persist and are widely readable). */
function persistInitialAdminPassword(deps: Pick<AdminProvisioningDeps, 'logger'>, tempPassword: string): void {
  const filePath = INITIAL_ADMIN_PASSWORD_FILE;
  try {
    writeFileSync(filePath, `admin@local : ${tempPassword}\n`, { encoding: 'utf8', mode: 0o600 });
    deps.logger.warn(
      `Default local admin: admin@local — mot de passe temporaire écrit dans ${filePath} (changement requis au premier login). Supprimez ce fichier après récupération.`,
    );
  } catch (err) {
    // Fallback: file system unavailable — log it (better than a silent lockout)
    deps.logger.error(`Impossible d'écrire ${filePath}: ${(err as Error).message}`);
    deps.logger.warn(`Default local admin: admin@local — temporary password: ${tempPassword}`);
  }
}

/** Extrait de AuthService.ensureDefaultAdmin sans changement de comportement. */
export async function ensureDefaultAdmin(deps: AdminProvisioningDeps): Promise<void> {
  // Ensure local_auth_enabled defaults to true
  const localAuthSetting = await deps.configService.get('general', 'local_auth_enabled');
  if (localAuthSetting === null || localAuthSetting === undefined || localAuthSetting === '') {
    await deps.configService.set('general', 'local_auth_enabled', 'true');
  }

  const existing = await deps.prisma.user.findUnique({ where: { email: ADMIN_LOCAL_EMAIL } });

  if (existing) {
    // Admin exists — do NOT reset the password (avoid reverting a custom password on restart)
    if (!existing.isLocalAccount) {
      const tempPassword = generateDefaultAdminPassword();
      const hash = await bcrypt.hash(tempPassword, 12);
      await deps.prisma.user.update({
        where: { id: existing.id },
        data: { isLocalAccount: true, passwordHash: hash, role: 'admin', isItStaff: true, mustChangePassword: true },
      });
      if (process.env.DEFAULT_ADMIN_PASSWORD) {
        deps.logger.warn('Default local admin upgraded: admin@local (mot de passe = DEFAULT_ADMIN_PASSWORD, changement requis au premier login)');
      } else {
        persistInitialAdminPassword(deps, tempPassword);
      }
    }
    return;
  }

  // Create default admin with must-change-password flag
  const tempPassword = generateDefaultAdminPassword();
  const hash = await bcrypt.hash(tempPassword, 12);
  try {
    await deps.prisma.user.create({
      data: {
        samAccountName: 'admin_local',
        displayName: 'Administrateur local',
        email: ADMIN_LOCAL_EMAIL,
        role: 'admin',
        isItStaff: true,
        isLocalAccount: true,
        passwordHash: hash,
        mustChangePassword: true,
        active: true,
      },
    });
    if (process.env.DEFAULT_ADMIN_PASSWORD) {
      deps.logger.warn('Default local admin created: admin@local (mot de passe = DEFAULT_ADMIN_PASSWORD, changement requis au premier login)');
    } else {
      persistInitialAdminPassword(deps, tempPassword);
    }
  } catch (err: unknown) {
    // Ne jamais avaler autre chose qu'une violation de contrainte unique
    // (l'admin a été créé entre-temps, p. ex. démarrages concurrents) —
    // toute autre erreur (DB indisponible, schéma invalide...) doit être
    // visible et relancée, pas masquée derrière un warn générique.
    const isAlreadyExists = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    if (isAlreadyExists) {
      deps.logger.warn('Could not create default local admin (already exists)');
      return;
    }
    deps.logger.error(
      `ensureDefaultAdmin: création de l'admin par défaut a échoué: ${(err as Error).message}`,
      (err as Error).stack,
    );
    throw err;
  }
}
