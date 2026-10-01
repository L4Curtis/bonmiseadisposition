import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { notifyDepartures } from '../ldap/departure-notifications';

/** Résultat de la désactivation en masse des comptes de l'annuaire. */
export interface LdapDeactivationOutcome {
  readonly deactivated: number;
}

/**
 * Désactivation en masse des comptes venus de l'annuaire (bouton « Désactiver
 * les comptes de l'annuaire » de l'écran de synchronisation).
 *
 * Ne supprime JAMAIS un compte : un compte référencé par un bon ne peut pas
 * l'être, et l'historique doit rester. Ne touche que les collaborateurs
 * synchronisés depuis l'annuaire, jamais un administrateur ou un technicien
 * (comptes SSO nécessaires à l'accès), ni la personne qui lance l'opération.
 */
@Injectable()
export class LdapAdminService {
  private readonly logger = new Logger(LdapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async deactivateAll(actorId: string, ip?: string | null): Promise<LdapDeactivationOutcome> {
    const result = await this.prisma.user.updateMany({
      where: { lastLdapSync: { not: null }, role: 'collaborator', active: true, id: { not: actorId } },
      data: { active: false },
    });
    await this.audit.recordSafely('ldap_users_deactivated', {
      actorId,
      details: { count: result.count },
      ip,
    });
    // Même conséquence qu'une désactivation par la synchronisation : du
    // matériel peut partir avec la personne, d'où la même alerte de départ.
    // Une panne de l'alerte ne remet pas en cause la désactivation.
    try {
      await notifyDepartures({
        prisma: this.prisma,
        logger: this.logger,
        sendAlert: (candidates) => this.notificationService.sendDepartureAlert(candidates),
      });
    } catch (err) {
      this.logger.error(`Alerte de départ en échec (désactivation non affectée) : ${err instanceof Error ? err.stack : String(err)}`);
    }
    return { deactivated: result.count };
  }
}
