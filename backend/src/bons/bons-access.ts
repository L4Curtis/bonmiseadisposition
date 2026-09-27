import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { BonStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user.interface';
import { isItRole } from '../common/roles';

/** Même message que pour un bon qui n'existe pas (queries/bon-where.ts). */
const BON_NOT_FOUND_MESSAGE = 'Bon introuvable';

/** Statuts d'un bon qui n'existe pas encore pour le collaborateur : le
 *  brouillon se prépare à l'IT, il ne lui est ni listé ni montré. */
const HIDDEN_FROM_HOLDER_STATUSES: readonly BonStatus[] = ['draft'];

/**
 * Vérifie l'accès à un bon sur les routes « propriétaire » (fiche, PDF,
 * intégrité, pièces jointes) : un compte non IT ne voit que SES bons, et
 * jamais un brouillon. Admins et techniciens ont un accès transverse à toutes
 * les filiales (modèle « IT centrale », décision produit 2026-06-11).
 *
 * Un brouillon répond 404 avec le message d'un bon inconnu : rien ne révèle
 * au collaborateur qu'un bon se prépare à son nom. Le bon d'un autre reste
 * refusé (403).
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
    select: { collaborateurId: true, status: true },
  });
  // Bon inconnu : la recherche du handler produit elle-même son 404.
  if (!bon) return;

  if (HIDDEN_FROM_HOLDER_STATUSES.includes(bon.status)) {
    throw new NotFoundException(BON_NOT_FOUND_MESSAGE);
  }
  if (bon.collaborateurId !== user.id) {
    throw new ForbiddenException('Accès refusé à ce bon');
  }
}
