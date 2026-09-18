import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { EncryptionService } from '../config/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { isItRole } from '../common/roles';
import * as nodemailer from 'nodemailer';
import { CONFIG_HEALTH_CATEGORIES, ConfigHealthSection, computeConfigHealth } from './config-health';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly encryption: EncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  async getConfigSection(category: string, options?: { maskSecrets?: boolean }) {
    return this.configService.getAll(category, options);
  }

  /**
   * GET /admin/config/health — état calculé par rubrique de configuration
   * (configuré / incomplet / désactivé / non configuré), sans jamais exposer
   * de secret : seule la présence d'une valeur est lue directement en base
   * (jamais déchiffrée). Voir config-health.ts pour les règles par rubrique.
   */
  async getConfigHealth(): Promise<{ sections: ConfigHealthSection[] }> {
    const rows = await this.prisma.appConfig.findMany({
      where: { category: { in: [...CONFIG_HEALTH_CATEGORIES] } },
      select: { category: true, key: true, value: true, updatedAt: true },
    });
    return { sections: computeConfigHealth(rows, { frontendUrlEnv: process.env.FRONTEND_URL }) };
  }

  async setConfigValue(
    category: string,
    key: string,
    value: string,
    options?: { encrypted?: boolean; description?: string; updatedById?: string },
  ) {
    await this.configService.set(category, key, value, options);
  }

  async bulkSetConfig(
    category: string,
    values: Record<string, string>,
    encryptedKeys: string[] = [],
    updatedById?: string,
  ) {
    // Une clé chiffrée reçue vide est ignorée plutôt qu'écrite : le front
    // envoie souvent '' pour un champ secret que l'utilisateur a seulement
    // focalisé sans le modifier (le champ affiché est masqué, jamais la
    // vraie valeur) — l'écrire écraserait silencieusement un secret existant
    // (LOT C bug #9). Une suppression volontaire n'est pas possible via ce
    // endpoint bulk ; elle nécessiterait un appel explicite dédié.
    const entries = Object.entries(values).filter(([key, v]) => {
      if (v === undefined || v === null) return false;
      if (encryptedKeys.includes(key) && v === '') return false;
      return true;
    });

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        const shouldEncrypt = encryptedKeys.includes(key);
        const storedValue = shouldEncrypt
          ? this.encryption.encrypt(value)
          : value;
        await tx.appConfig.upsert({
          where: { category_key: { category, key } },
          update: { value: storedValue, encrypted: shouldEncrypt, updatedById },
          create: { category, key, value: storedValue, encrypted: shouldEncrypt, updatedById },
        });
      }
    });

    this.configService.invalidateCache(category);
  }

  async testSmtp(testEmail?: string): Promise<{ success: boolean; message: string }> {
    if (testEmail !== undefined && testEmail !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(testEmail)) {
        throw new BadRequestException('Adresse email invalide');
      }
    }
    try {
      const host = await this.configService.get('smtp', 'host');
      const port = await this.configService.get('smtp', 'port');
      const user = await this.configService.get('smtp', 'user');
      const pass = await this.configService.get('smtp', 'password');
      const secure = await this.configService.get('smtp', 'secure');
      const from = await this.configService.get('smtp', 'from');

      if (!host || !port) {
        return { success: false, message: 'Configuration SMTP incomplète (host/port manquant)' };
      }
      // Aucune valeur fictive par défaut : envoyer un email de test depuis une
      // adresse inventée serait trompeur (et souvent rejeté par le serveur SMTP
      // ou classé comme spam). L'expéditeur doit être configuré explicitement.
      if (testEmail && !from) {
        return { success: false, message: 'Expéditeur SMTP (smtp.from) non configuré' };
      }

      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: secure === 'true',
        auth: user && pass ? { user, pass } : undefined,
        tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
      });

      await transporter.verify();

      // If a test email is provided, send a real test message
      if (testEmail) {
        await transporter.sendMail({
          // Non-null garanti par la vérification `testEmail && !from` ci-dessus
          from: from as string,
          to: testEmail,
          subject: '[Test] Bons de mise à disposition — Test SMTP',
          html: `
            <div style="font-family:'Hanken Grotesk',Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1B1A18">
              <h2 style="color:#D8372B">Test de configuration SMTP ✓</h2>
              <p>Cet email confirme que votre configuration SMTP est correctement paramétrée dans l'application <strong>Bons de mise à disposition</strong>.</p>
              <p style="color:#6B665E;font-size:13px">Envoyé depuis : <code>${host}:${port}</code></p>
              <hr style="border:none;border-top:1px solid #E2DFD9;margin:16px 0">
              <p style="font-size:12px;color:#A79F94">Service informatique — Groupe Livio</p>
            </div>`,
        });
        return { success: true, message: `Email de test envoyé à ${testEmail}` };
      }

      return { success: true, message: 'Connexion SMTP réussie (serveur joignable)' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Erreur de connexion SMTP' };
    }
  }

  /**
   * « Purge » des utilisateurs LDAP : ne supprime JAMAIS physiquement (un user
   * référencé par un bon fait échouer le delete de toute façon, et il n'y a
   * aucune raison de perdre l'historique). Désactive uniquement les comptes
   * synchronisés depuis LDAP (lastLdapSync renseigné), de rôle collaborator —
   * jamais admin/technician, qui peuvent être des comptes SSO nécessaires à
   * l'accès continu — et jamais l'appelant lui-même (LOT C bug #5).
   */
  async purgeLdapUsers(currentUserId: string): Promise<{ deactivated: number }> {
    const result = await this.prisma.user.updateMany({
      where: {
        lastLdapSync: { not: null },
        role: 'collaborator',
        active: true,
        id: { not: currentUserId },
      },
      data: { active: false },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: currentUserId,
        action: 'ldap_users_deactivated',
        details: { count: result.count, by: currentUserId },
      },
    }).catch((err: unknown) => {
      this.logger.error(`Audit ldap_users_deactivated non journalisé: ${(err as Error).message}`);
    });

    return { deactivated: result.count };
  }

  /**
   * Supprime les échecs de connexion locale récents (30 min) pour l'email de
   * l'utilisateur ciblé — lève le verrou de brute-force (LOT C bug #2c) sans
   * attendre l'expiration de la fenêtre.
   */
  async unlockUser(targetUserId: string, byUserId: string): Promise<{ unlocked: boolean; removed: number }> {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const windowStart = new Date(Date.now() - 30 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        userEmail: target.email,
        action: 'login_local_failed',
        createdAt: { gte: windowStart },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: byUserId,
        action: 'user_unlocked',
        details: { targetEmail: target.email },
      },
    }).catch((err: unknown) => {
      this.logger.error(`Audit user_unlocked non journalisé: ${(err as Error).message}`);
    });

    return { unlocked: true, removed: result.count };
  }

  /**
   * Garde-fou avant désactivation de l'authentification locale (LOT C bug
   * #11) : sans au moins un admin actif non local (SSO), désactiver l'auth
   * locale couperait tout accès administrateur à l'application.
   */
  async ensureNonLocalAdminExists(): Promise<void> {
    const count = await this.prisma.user.count({
      where: { role: 'admin', active: true, isLocalAccount: false },
    });
    if (count === 0) {
      throw new BadRequestException(
        "Impossible de désactiver l'authentification locale : aucun compte administrateur actif non local (SSO) n'existe. Configurez d'abord un admin SSO pour ne pas perdre tout accès.",
      );
    }
  }

  /**
   * PATCH /admin/users/:id/role — change manuellement le rôle d'un
   * utilisateur. Effectif immédiatement, mais pour un compte SSO ne vaut que
   * jusqu'à la prochaine connexion : `AuthService.syncUserRoleFromGroups`
   * recalcule et écrase le rôle depuis les groupes Entra à chaque login, sans
   * exception (voir kpi-design.md, « Rôle direction »). Utile surtout pour
   * les comptes locaux et pour un rattrapage ponctuel.
   */
  async changeUserRole(
    targetUserId: string,
    role: UserRole,
    actor: { id: string },
  ): Promise<{ id: string; role: UserRole; isItStaff: boolean }> {
    if (targetUserId === actor.id) {
      throw new BadRequestException('Vous ne pouvez pas modifier votre propre rôle');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Garde « dernier administrateur » : seulement si la cible est un admin
    // ACTIF (un admin déjà désactivé ne compte pas pour l'accès), en comptant
    // les autres admins actifs (la cible exclue explicitement).
    if (target.role === 'admin' && target.active && role !== 'admin') {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: 'admin', active: true, id: { not: targetUserId } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('Impossible de retirer le dernier administrateur actif');
      }
    }

    const isItStaff = isItRole(role);
    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role, isItStaff },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: actor.id,
          action: 'user_role_changed',
          details: { targetEmail: target.email, from: target.role, to: role },
        },
      })
      .catch((err: unknown) => {
        this.logger.error(`Audit user_role_changed non journalisé: ${(err as Error).message}`);
      });

    return { id: updated.id, role: updated.role, isItStaff: updated.isItStaff };
  }

  async testEntra(): Promise<{ success: boolean; message: string }> {
    try {
      const tenantId = await this.configService.get('entra', 'tenant_id');
      const clientId = await this.configService.get('entra', 'client_id');
      const clientSecret = await this.configService.get('entra', 'client_secret');

      if (!tenantId || !clientId || !clientSecret) {
        return { success: false, message: 'Configuration Entra ID incomplète' };
      }

      // Test: try to get an app token from the Microsoft identity platform
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      let response: Response;
      try {
        response = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: clientId,
              client_secret: clientSecret,
              scope: 'https://graph.microsoft.com/.default',
            }),
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        return { success: true, message: 'Connexion Entra ID réussie' };
      } else {
        const body = await response.json() as { error_description?: string };
        return { success: false, message: body.error_description || 'Erreur Entra ID' };
      }
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Erreur de connexion Entra ID' };
    }
  }
}
