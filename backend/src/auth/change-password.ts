import { Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { validatePasswordStrength } from './password-strength';
import { ADMIN_LOCAL_EMAIL, deleteInitialAdminPasswordFile } from './admin-provisioning';

export interface ChangePasswordDeps {
  prisma: PrismaService;
  logger: Logger;
}

/** Extrait de AuthService.changePassword sans changement de comportement. */
export async function changePassword(
  deps: ChangePasswordDeps,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.isLocalAccount || !user.passwordHash) {
    throw new UnauthorizedException('Ce compte ne supporte pas la modification de mot de passe local');
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedException('Mot de passe actuel incorrect');
  }

  validatePasswordStrength(newPassword);

  const hash = await bcrypt.hash(newPassword, 12);
  await deps.prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date() },
  });

  // Le mot de passe temporaire écrit sur disque au provisioning n'a plus de
  // raison d'exister une fois que admin@local a changé son mot de passe.
  if (user.email === ADMIN_LOCAL_EMAIL) {
    deleteInitialAdminPasswordFile(deps);
  }
}
