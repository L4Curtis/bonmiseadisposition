import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user.interface';
import { isItRole } from '../common/roles';

/**
 * Vérifie l'accès à un bon : les collaborateurs ne voient que leur propre
 * bon. Admins et techniciens ont un accès transverse à toutes les filiales
 * (modèle « IT centrale », décision produit 2026-06-11).
 *
 * Extrait de BonsController.verifyCollaboratorAccess sans changement de
 * comportement — `prisma` explicite plutôt que `this.prisma`.
 */
export async function verifyCollaboratorAccess(
  prisma: PrismaService,
  bonId: string,
  user: AuthUser,
): Promise<void> {
  if (!user) {
    throw new ForbiddenException('Accès refusé');
  }
  if (isItRole(user.role)) return;

  const bon = await prisma.bon.findUnique({
    where: { id: bonId },
    select: { collaborateurId: true },
  });
  // Unknown bon: let the handler's own lookup produce its 404
  if (!bon) return;

  if (bon.collaborateurId !== user.id) {
    throw new ForbiddenException('Accès refusé à ce bon');
  }
}
