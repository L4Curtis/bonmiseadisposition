import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Ce que le jeton d'identité contenait au sujet des groupes. */
export type GroupsClaimState =
  /** La revendication « groups » est présente : la correspondance a pu être faite. */
  | 'presente'
  /** Entra a remplacé la liste par `_claim_names` / `hasgroups` : trop de groupes
   *  pour le jeton (dépassement), la liste doit être lue via Microsoft Graph. */
  | 'depassement'
  /** Revendication absente : elle n'est pas configurée sur l'inscription
   *  d'application Entra (Configuration du jeton → revendication de groupes). */
  | 'absente';

export interface SsoRoleDiagnostic {
  state: GroupsClaimState;
  /** Nombre de groupes reçus (0 si la revendication est absente). */
  groupsCount: number;
  /** Identifiants de groupe configurés côté application, par rôle. */
  configured: { admin: boolean; technician: boolean; direction: boolean };
  /** Rôle retenu, ou `null` quand le rôle existant a été conservé faute de groupes. */
  resolvedRole: string | null;
  /** Vrai quand des groupes ont été reçus mais qu'aucun ne correspond aux
   *  identifiants configurés : c'est le cas « je suis dans le groupe mais je
   *  n'ai pas le rôle » le plus fréquent (identifiant erroné ou groupe non émis). */
  aucuneCorrespondance: boolean;
}

export const SSO_ROLE_SYNC_ACTION = 'sso_role_sync';

/** État des groupes déduit des revendications du jeton d'identité. */
export function readGroupsClaimState(claims: Record<string, unknown> | undefined): {
  state: GroupsClaimState;
  groups: string[];
} {
  const groups = claims?.['groups'];
  if (Array.isArray(groups)) {
    return { state: 'presente', groups: groups.filter((g): g is string => typeof g === 'string') };
  }
  // Dépassement : au-delà de ~150 groupes, Entra retire la liste et pose
  // `_claim_names` / `_claim_sources` (ou `hasgroups`) à la place.
  if (claims && ('_claim_names' in claims || 'hasgroups' in claims)) {
    return { state: 'depassement', groups: [] };
  }
  return { state: 'absente', groups: [] };
}

/** Message d'explication affiché dans l'administration et écrit dans les journaux. */
export function diagnosticMessage(diagnostic: SsoRoleDiagnostic): string {
  switch (diagnostic.state) {
    case 'absente':
      return "L'inscription d'application Entra n'envoie pas la revendication « groups » : "
        + 'Entra ID → Inscriptions d\'application → Configuration du jeton → Ajouter une revendication de groupes '
        + '(groupes de sécurité, identifiant de groupe), pour le jeton d\'identité. Sans elle, le rôle en base est conservé.';
    case 'depassement':
      return "L'utilisateur appartient à trop de groupes : Entra ne les liste plus dans le jeton. "
        + 'Limitez la revendication aux groupes affectés à l\'application.';
    default:
      return diagnostic.aucuneCorrespondance
        ? `Aucun des ${diagnostic.groupsCount} groupes reçus ne correspond aux identifiants configurés : `
          + 'vérifiez que la valeur saisie est bien l\'identifiant d\'objet du groupe.'
        : `Rôle « ${diagnostic.resolvedRole} » attribué depuis les groupes reçus.`;
  }
}

/** Trace chaque connexion SSO pour rendre la correspondance des groupes
 *  observable : sans cela, « je suis dans le groupe mais je n'ai pas le rôle »
 *  n'est diagnosticable que dans les journaux du conteneur. */
export async function recordSsoRoleDiagnostic(
  prisma: PrismaService,
  user: { id: string; email: string | null },
  diagnostic: SsoRoleDiagnostic,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userEmail: user.email,
      action: SSO_ROLE_SYNC_ACTION,
      details: {
        ...diagnostic,
        message: diagnosticMessage(diagnostic),
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
