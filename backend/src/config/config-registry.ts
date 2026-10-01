/**
 * Registre de la configuration : chaque réglage modifiable dans l'écran
 * Configuration, avec son type, ses bornes, sa valeur par défaut, s'il est
 * secret (chiffré en base), s'il est réservé à l'administrateur et la rubrique
 * de l'état de santé où il compte.
 *
 * C'est la référence unique des valeurs par défaut : un service lit un réglage
 * par `ConfigRegistryService.getBool/getInt/getString('rubrique.nom')`, qui
 * applique ce registre, au lieu de relire la chaîne brute et de recoder son
 * défaut. Ajouter un réglage = une entrée ici, puis son champ dans l'écran.
 */
import type { ConfigCategory } from '../contracts/admin';
import type { ConfigScalar, ConfigValueSource, ConfigValueType } from '../contracts/config-registry';
import { DEFAULT_SIGNATURE_OVERDUE_DAYS } from '../common/bon-predicates';

export interface ConfigDefinition {
  readonly label: string;
  readonly type: ConfigValueType;
  readonly defaultValue: ConfigScalar | null;
  readonly min?: number;
  readonly max?: number;
  /** Variable d'environnement qui remplace le défaut quand rien n'est saisi. */
  readonly environmentFallback?: string;
  readonly adminOnly: boolean;
  readonly healthSection: ConfigCategory;
}

type Definition<T extends ConfigValueType, D extends ConfigScalar | null> = ConfigDefinition & {
  readonly type: T;
  readonly defaultValue: D;
};

function bool(label: string, defaultValue: boolean, healthSection: ConfigCategory): Definition<'boolean', boolean> {
  return { label, type: 'boolean', defaultValue, adminOnly: true, healthSection };
}

function int(
  label: string,
  defaultValue: number,
  bounds: { min: number; max?: number },
  healthSection: ConfigCategory,
): Definition<'integer', number> {
  return { label, type: 'integer', defaultValue, ...bounds, adminOnly: true, healthSection };
}

function text<T extends 'string' | 'url' | 'email' | 'secret'>(
  type: T,
  label: string,
  healthSection: ConfigCategory,
  defaultValue: string | null = null,
): Definition<T, string | null> {
  return { label, type, defaultValue, adminOnly: true, healthSection };
}

/** Filtre de l'annuaire par défaut : personnes, comptes désactivés exclus. */
const DEFAULT_LDAP_USER_FILTER = '(&(objectClass=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';

export const CONFIG_REGISTRY = {
  'general.local_auth_enabled': bool('Connexion locale autorisée', true, 'general'),
  'general.app_url': {
    ...text('url', 'URL publique de l’application', 'general'),
    environmentFallback: 'FRONTEND_URL',
  },

  'entra.tenant_id': text('string', 'Tenant ID', 'entra'),
  'entra.client_id': text('string', 'Client ID', 'entra'),
  'entra.client_secret': text('secret', 'Client Secret', 'entra'),
  'entra.redirect_uri': text('url', 'URL de retour (redirect URI)', 'entra'),
  'entra.admin_group_id': text('string', 'Groupe Administrateurs', 'entra'),
  'entra.technician_group_id': text('string', 'Groupe Techniciens', 'entra'),
  'entra.direction_group_id': text('string', 'Groupe Direction', 'entra'),

  'ldap.enabled': bool('Synchronisation de l’annuaire activée', true, 'ldap'),
  'ldap.url': text('string', 'URL LDAP', 'ldap'),
  'ldap.use_ssl': bool('Connexion chiffrée (LDAPS)', false, 'ldap'),
  'ldap.search_base': text('string', 'Base de recherche', 'ldap'),
  'ldap.bind_dn': text('string', 'Compte de connexion (Bind DN)', 'ldap'),
  'ldap.bind_password': text('secret', 'Mot de passe du compte de connexion', 'ldap'),
  'ldap.user_filter': text('string', 'Filtre des comptes', 'ldap', DEFAULT_LDAP_USER_FILTER),
  'ldap.sync_interval_hours': int('Intervalle de synchronisation (heures)', 6, { min: 1 }, 'ldap'),

  'smtp.host': text('string', 'Serveur SMTP', 'smtp'),
  'smtp.port': int('Port', 587, { min: 1, max: 65535 }, 'smtp'),
  'smtp.secure': bool('Connexion chiffrée (TLS)', false, 'smtp'),
  'smtp.user': text('string', 'Utilisateur', 'smtp'),
  'smtp.password': text('secret', 'Mot de passe', 'smtp'),
  'smtp.from': text('email', 'Adresse d’expéditeur', 'smtp'),

  'smb.enabled': bool('Export vers un partage réseau activé', false, 'smb'),
  'smb.path': text('string', 'Chemin du partage', 'smb'),
  'smb.username': text('string', 'Utilisateur', 'smb'),
  'smb.password': text('secret', 'Mot de passe', 'smb'),
  'smb.domain': text('string', 'Domaine', 'smb'),

  'rappels.enabled': bool('Rappels automatiques activés', true, 'rappels'),
  'rappels.delay_1': int('Premier rappel (jours après l’envoi)', 3, { min: 1 }, 'rappels'),
  'rappels.delay_2': int('Deuxième rappel (jours après l’envoi)', 7, { min: 1 }, 'rappels'),
  'rappels.delay_3': int('Troisième rappel (jours après l’envoi)', 14, { min: 1 }, 'rappels'),
  'rappels.restitution_before_days': int(
    'Rappel de restitution (jours avant la date prévue, 0 = aucun)',
    7,
    { min: 0 },
    'rappels',
  ),
  'rappels.signature_overdue_days': int(
    'Signature en retard après (jours)',
    DEFAULT_SIGNATURE_OVERDUE_DAYS,
    { min: 1 },
    'rappels',
  ),

  'tokens.expiry_days': int('Validité des liens de signature (jours)', 7, { min: 1, max: 30 }, 'tokens'),

  'timestamp.enabled': bool('Horodatage des signatures activé', false, 'timestamp'),
  'timestamp.tsa_url': text('url', 'URL de l’autorité d’horodatage (TSA)', 'timestamp'),

  'retention.enabled': bool('Anonymisation automatique activée', false, 'retention'),
  'retention.anonymize_months': int('Anonymisation des bons après (mois)', 60, { min: 60, max: 600 }, 'retention'),
  'retention.attachment_months': int('Suppression des pièces jointes après (mois)', 24, { min: 1, max: 600 }, 'retention'),
  'retention.expired_tokens_days': int('Suppression des liens expirés après (jours)', 30, { min: 1 }, 'retention'),
  'retention.audit_logs_years': int('Conservation du journal d’audit (années)', 5, { min: 1 }, 'retention'),
} as const satisfies Readonly<Record<string, ConfigDefinition>>;

export type ConfigKey = keyof typeof CONFIG_REGISTRY;

type KeysOfType<T extends ConfigValueType> = {
  [K in ConfigKey]: (typeof CONFIG_REGISTRY)[K]['type'] extends T ? K : never;
}[ConfigKey];

export type BooleanConfigKey = KeysOfType<'boolean'>;
export type IntegerConfigKey = KeysOfType<'integer'>;
/** Réglages lus comme du texte (texte, URL, email, secret déchiffré). */
export type StringConfigKey = KeysOfType<'string' | 'url' | 'email' | 'secret'>;

export function configDefinition(key: ConfigKey): ConfigDefinition {
  return CONFIG_REGISTRY[key];
}

/** « retention.audit_logs_years » → rubrique et nom en base. */
export function splitConfigKey(key: ConfigKey): { category: ConfigCategory; name: string } {
  const [category, name] = key.split('.') as [ConfigCategory, string];
  return { category, name };
}

export interface ResolvedConfigValue {
  readonly applied: ConfigScalar | null;
  readonly source: ConfigValueSource;
  /** Saisie écartée (illisible) ou ramenée à une borne. */
  readonly adjusted: boolean;
}

function fallback(definition: ConfigDefinition, env: NodeJS.ProcessEnv, adjusted: boolean): ResolvedConfigValue {
  const fromEnv = definition.environmentFallback ? env[definition.environmentFallback]?.trim() : undefined;
  if (fromEnv) return { applied: fromEnv, source: 'environment', adjusted };
  return { applied: definition.defaultValue, source: 'default', adjusted };
}

function resolveInteger(definition: ConfigDefinition, raw: string, env: NodeJS.ProcessEnv): ResolvedConfigValue {
  if (!/^-?\d+$/.test(raw)) return fallback(definition, env, true);
  const parsed = Number(raw);
  const clamped = Math.min(definition.max ?? Infinity, Math.max(definition.min ?? -Infinity, parsed));
  return { applied: clamped, source: 'stored', adjusted: clamped !== parsed };
}

/**
 * Valeur appliquée d'un réglage, d'après la chaîne saisie en base (`null` si
 * rien) : booléen « true »/« false », entier ramené à ses bornes, texte sans
 * espaces autour. Une saisie vide ou illisible laisse place à la variable
 * d'environnement prévue, sinon au défaut.
 */
export function resolveConfigValue(
  definition: ConfigDefinition,
  stored: string | null,
  env: NodeJS.ProcessEnv = {},
): ResolvedConfigValue {
  const raw = stored?.trim() ?? '';
  if (raw === '') return fallback(definition, env, false);
  if (definition.type === 'boolean') {
    if (raw === 'true' || raw === 'false') return { applied: raw === 'true', source: 'stored', adjusted: false };
    return fallback(definition, env, true);
  }
  if (definition.type === 'integer') return resolveInteger(definition, raw, env);
  return { applied: raw, source: 'stored', adjusted: false };
}
