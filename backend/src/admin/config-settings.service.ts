import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { EncryptionService } from '../config/encryption.service';
import { SECRET_MASK } from '../config/config-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LdapService } from '../ldap/ldap.service';
import type { ConfigCategory } from '../contracts/admin';
import { CONFIG_HEALTH_CATEGORIES, ConfigHealthSection, computeConfigHealth } from './config-health';
import { assertConfigCategory, describeConfigChanges, secretNamesOf, toAuditDetails, validateConfigUpdate } from './config-update';

/** Auteur d'un enregistrement de configuration. */
export interface ConfigActor {
  readonly id: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Lecture et enregistrement des rubriques de l'écran Configuration.
 *
 * Chaque enregistrement qui change au moins un réglage est tracé dans le
 * journal (`config_updated`), dans la même transaction que l'écriture : la
 * clé, son libellé, l'ancienne et la nouvelle valeur — et, pour un secret,
 * seulement « modifié ».
 */
@Injectable()
export class ConfigSettingsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly encryption: EncryptionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ldap: LdapService,
  ) {}

  /** Valeurs saisies d'une rubrique, secrets masqués. */
  async getSection(category: string): Promise<Record<string, string | null>> {
    return this.config.getAll(assertConfigCategory(category), { maskSecrets: true });
  }

  /** GET /admin/config/health — état par rubrique, sans aucun secret. */
  async getHealth(): Promise<{ sections: ConfigHealthSection[] }> {
    const rows = await this.prisma.appConfig.findMany({
      where: { category: { in: [...CONFIG_HEALTH_CATEGORIES] } },
      select: { category: true, key: true, value: true, updatedAt: true },
    });
    return { sections: computeConfigHealth(rows, { frontendUrlEnv: process.env.FRONTEND_URL }) };
  }

  /**
   * Enregistre les valeurs d'une rubrique. Un secret envoyé vide, ou égal au
   * masque que l'écran affiche à la place de la vraie valeur, est ignoré :
   * c'est un champ que l'on n'a pas retapé, et l'écrire effacerait (ou
   * remplacerait par le masque) le secret en place.
   */
  async update(category: string, body: Record<string, unknown>, actor: ConfigActor): Promise<void> {
    const validated = validateConfigUpdate(category, body, (filter) => this.ldap.validateLdapFilter(filter));
    const section = category as ConfigCategory;
    if (section === 'general' && validated.local_auth_enabled === 'false') {
      await this.ensureNonLocalAdminExists();
    }
    const secrets = secretNamesOf(section);
    const values = Object.fromEntries(
      Object.entries(validated).filter(([name, value]) => !(secrets.includes(name) && (value === '' || value === SECRET_MASK))),
    );
    const before = await this.config.getAll(section);
    const changes = describeConfigChanges(section, before, values);

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        const encrypted = secrets.includes(key);
        const stored = encrypted ? this.encryption.encrypt(value) : value;
        await tx.appConfig.upsert({
          where: { category_key: { category: section, key } },
          update: { value: stored, encrypted, updatedById: actor.id },
          create: { category: section, key, value: stored, encrypted, updatedById: actor.id },
        });
      }
      if (changes) {
        await this.audit.record(
          'config_updated',
          { actorId: actor.id, details: toAuditDetails(changes), ip: actor.ip, userAgent: actor.userAgent },
          { tx },
        );
      }
    });
    this.config.invalidateCache(section);
  }

  /**
   * Garde-fou avant de couper la connexion locale : sans au moins un
   * administrateur actif qui se connecte par Microsoft (SSO), plus personne ne
   * pourrait administrer l'application.
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
}
