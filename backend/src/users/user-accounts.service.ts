import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LOGIN_LOCK_WINDOW_MS } from '../audit/login-lock';
import { AppException } from '../common/errors';
import { isItRole } from '../common/roles';
import { ConfigRegistryService } from '../config/config-registry.service';
import type { ChangeUserRoleResponse, UnlockUserResponse } from '../contracts/users';
import { normalizeEmail } from '../auth/utils/normalize-email.util';
import { USER_SAFE_SELECT } from './user-select';

/** Administrateur qui agit sur un compte. */
export interface AccountActor {
  readonly id: string;
}

/**
 * Actions de l'administrateur sur un compte, depuis l'écran Utilisateurs :
 * rôle, déverrouillage de la connexion locale, désactivation et réactivation.
 * Chaque action est tracée au journal d'audit.
 */
@Injectable()
export class UserAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: ConfigRegistryService,
  ) {}

  /**
   * PATCH /users/:id/role — effectif immédiatement. Pour un compte SSO, ne
   * vaut que jusqu'à la prochaine connexion : le rôle y est recalculé depuis
   * les groupes Entra (voir AuthService.syncUserRoleFromGroups).
   */
  async changeRole(targetId: string, role: UserRole, actor: AccountActor, ip?: string): Promise<ChangeUserRoleResponse> {
    if (targetId === actor.id) {
      throw new AppException('own_account', 'Vous ne pouvez pas modifier votre propre rôle.');
    }
    const target = await this.findTarget(targetId);
    if (target.role === 'admin' && role !== 'admin') {
      await this.assertNotLastAdmin(target, 'Impossible de retirer le dernier administrateur actif.');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role, isItStaff: isItRole(role) },
    });
    await this.audit.recordSafely('user_role_changed', {
      actorId: actor.id,
      details: { targetUserId: target.id, targetEmail: target.email, from: target.role, to: role },
      ip,
    });
    return { id: updated.id, role: updated.role, isItStaff: updated.isItStaff };
  }

  /**
   * POST /users/:id/unlock — lève le verrou anti force brute de la connexion
   * locale. Rien n'est effacé du journal : l'entrée `user_unlocked` marque le
   * point à partir duquel les échecs comptent de nouveau (audit/login-lock.ts).
   * `failedAttempts` : échecs des 30 dernières minutes qui ne comptent plus.
   */
  async unlock(targetId: string, actor: AccountActor, ip?: string): Promise<UnlockUserResponse> {
    const target = await this.findTarget(targetId);
    if (!target.email) {
      throw new AppException('no_local_login', "Ce compte n'a pas d'adresse email : il ne se connecte pas, il n'y a rien à déverrouiller.");
    }
    // L'adresse telle que la connexion la trace et la cherche (login-lock.ts) :
    // sinon le marqueur ne correspondrait pas et le verrou resterait posé.
    const email = normalizeEmail(target.email);
    const failedAttempts = await this.prisma.auditLog.count({
      where: {
        userEmail: email,
        action: 'login_local_failed',
        createdAt: { gte: new Date(Date.now() - LOGIN_LOCK_WINDOW_MS) },
      },
    });
    await this.audit.record('user_unlocked', {
      actorId: actor.id,
      details: { targetUserId: target.id, targetEmail: email },
      ip,
    });
    return { unlocked: true, failedAttempts };
  }

  /**
   * POST /users/:id/deactivate et /reactivate. Un compte venu de l'annuaire
   * (Active Directory, SSO) ne se gère dans l'application que lorsque
   * l'annuaire est inactif : sinon la synchronisation fait foi, et le départ
   * se traite dans Active Directory. Un compte créé à la main ou un compte
   * local se gère toujours ici.
   */
  async setActive(targetId: string, active: boolean, actor: AccountActor, ip?: string) {
    if (targetId === actor.id && !active) {
      throw new AppException('own_account', 'Vous ne pouvez pas désactiver votre propre compte.');
    }
    const target = await this.findTarget(targetId);
    const account = accountKind(target);
    if (account === 'directory' && (await this.directoryActive())) {
      throw new AppException(
        'directory_active',
        "L'annuaire est actif : ce compte se désactive dans Active Directory, puis la synchronisation l'applique ici.",
        HttpStatus.CONFLICT,
      );
    }
    if (target.active === active) {
      return this.prisma.user.findUnique({ where: { id: targetId }, select: USER_SAFE_SELECT });
    }
    if (!active && target.role === 'admin') {
      await this.assertNotLastAdmin(target, 'Impossible de désactiver le dernier administrateur actif.');
    }

    const updated = await this.prisma.user.update({ where: { id: targetId }, data: { active }, select: USER_SAFE_SELECT });
    await this.audit.recordSafely(active ? 'user_reactivated' : 'user_deactivated', {
      actorId: actor.id,
      details: { targetUserId: target.id, targetEmail: target.email, displayName: target.displayName, account },
      ip,
    });
    return updated;
  }

  /** L'annuaire synchronise les comptes : coché ET adresse renseignée, comme
   *  la synchronisation planifiée (LdapService.scheduledSync). */
  async directoryActive(): Promise<boolean> {
    if (!(await this.settings.getBool('ldap.enabled'))) return false;
    const url = await this.settings.getString('ldap.url');
    return !!url && url.trim() !== '';
  }

  private async findTarget(id: string): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    return target;
  }

  /** La cible est exclue du comptage : il faut un AUTRE administrateur actif.
   *  Un administrateur déjà désactivé ne compte pas pour l'accès. */
  private async assertNotLastAdmin(target: User, message: string): Promise<void> {
    if (!target.active) return;
    const others = await this.prisma.user.count({ where: { role: 'admin', active: true, id: { not: target.id } } });
    if (others === 0) throw new AppException('last_admin', message, HttpStatus.CONFLICT);
  }
}

/** Origine d'un compte, telle que l'écran la présente. */
export type AccountKind = 'manual' | 'local' | 'directory';

export function accountKind(user: Pick<User, 'isManualAccount' | 'isLocalAccount'>): AccountKind {
  if (user.isManualAccount) return 'manual';
  if (user.isLocalAccount) return 'local';
  return 'directory';
}
