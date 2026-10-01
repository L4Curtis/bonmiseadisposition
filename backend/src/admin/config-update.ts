/**
 * Enregistrement d'une rubrique de configuration (PUT /admin/config/:category) :
 * contrôle des valeurs d'après le registre (`config/config-registry.ts`), puis
 * description des changements pour le journal d'audit (`config_updated`).
 *
 * Deux règles distinctes sur les bornes :
 *  - à l'enregistrement, une valeur hors bornes est REFUSÉE (400), avec le
 *    libellé du réglage et ses bornes ;
 *  - à la lecture, une valeur déjà en base et hors bornes (saisie avant que la
 *    borne existe) est RAMENÉE À LA BORNE par le registre, partout de la même
 *    façon, et l'écran le signale (« ajustée »).
 *
 * Une valeur vide est acceptée : elle efface la saisie, et la valeur par défaut
 * (ou la variable d'environnement prévue) s'applique de nouveau.
 */
import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/errors';
import type { ConfigCategory } from '../contracts/admin';
import { CONFIG_REGISTRY, ConfigDefinition, ConfigKey, configDefinition } from '../config/config-registry';

/** Longueur maximale d'une valeur saisie. */
export const MAX_CONFIG_VALUE_LENGTH = 2000;

/** Nom des rubriques, tel que l'écran Configuration les affiche. */
export const CONFIG_SECTION_LABELS: Readonly<Record<ConfigCategory, string>> = {
  general: 'Général',
  entra: 'Entra ID (SSO)',
  ldap: 'Active Directory',
  smtp: 'Email / SMTP',
  smb: 'Export SMB',
  rappels: 'Rappels',
  tokens: 'Tokens',
  timestamp: 'Horodatage',
  retention: 'Rétention RGPD',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isConfigCategory(value: string): value is ConfigCategory {
  return Object.prototype.hasOwnProperty.call(CONFIG_SECTION_LABELS, value);
}

/** Rubrique connue, sinon 400 `unknown_config_category`. */
export function assertConfigCategory(value: string): ConfigCategory {
  if (!isConfigCategory(value)) {
    throw new AppException('unknown_config_category', `Rubrique de configuration inconnue : ${value}`);
  }
  return value;
}

/** Clés du registre d'une rubrique, dans l'ordre du registre. */
export function configKeysOf(category: ConfigCategory): ConfigKey[] {
  return (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).filter((key) => key.startsWith(`${category}.`));
}

/** Noms (sans la rubrique) des réglages secrets d'une rubrique. */
export function secretNamesOf(category: ConfigCategory): string[] {
  return configKeysOf(category)
    .filter((key) => configDefinition(key).type === 'secret')
    .map((key) => key.slice(category.length + 1));
}

function invalid(field: string, message: string): AppException {
  return new AppException('validation_failed', message, HttpStatus.BAD_REQUEST, {
    errors: [{ field, messages: [message] }],
  });
}

function boundsText(definition: ConfigDefinition): string {
  if (definition.max !== undefined) return `entre ${definition.min ?? 0} et ${definition.max}`;
  return `supérieur ou égal à ${definition.min ?? 0}`;
}

function normalizeInteger(name: string, definition: ConfigDefinition, value: string): string {
  const parsed = /^-?\d+$/.test(value) ? Number(value) : NaN;
  const tooLow = definition.min !== undefined && parsed < definition.min;
  const tooHigh = definition.max !== undefined && parsed > definition.max;
  if (!Number.isInteger(parsed) || tooLow || tooHigh) {
    throw invalid(name, `${definition.label} : un nombre entier ${boundsText(definition)} est attendu.`);
  }
  return String(parsed);
}

function normalizeUrl(name: string, definition: ConfigDefinition, value: string): string {
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw invalid(name, `${definition.label} : une adresse http(s) valide est attendue.`);
  }
  return value.replace(/\/+$/, '');
}

/** Valeur contrôlée et normalisée d'un réglage non vide. */
function normalizeValue(
  name: string,
  definition: ConfigDefinition,
  value: string,
  checkLdapFilter: (filter: string) => void,
): string {
  switch (definition.type) {
    case 'boolean':
      if (value !== 'true' && value !== 'false') throw invalid(name, `${definition.label} : « true » ou « false » attendu.`);
      return value;
    case 'integer':
      return normalizeInteger(name, definition, value);
    case 'email':
      if (!EMAIL_RE.test(value)) throw invalid(name, `${definition.label} : une adresse email valide est attendue.`);
      return value;
    case 'url':
      return normalizeUrl(name, definition, value);
    default:
      if (name === 'user_filter') {
        try {
          checkLdapFilter(value);
        } catch (err) {
          throw invalid(name, `${definition.label} : ${err instanceof Error ? err.message : 'filtre invalide'}`);
        }
      }
      return value;
  }
}

function checkShape(category: ConfigCategory, body: Record<string, unknown>): void {
  const known = new Set(configKeysOf(category).map((key) => key.slice(category.length + 1)));
  const unknownKeys = Object.keys(body).filter((name) => !known.has(name));
  if (unknownKeys.length > 0) {
    throw new AppException(
      'unknown_config_key',
      `Réglage(s) inconnu(s) dans la rubrique « ${CONFIG_SECTION_LABELS[category]} » : ${unknownKeys.join(', ')}`,
    );
  }
  for (const [name, value] of Object.entries(body)) {
    if (typeof value !== 'string') throw invalid(name, `${name} : une chaîne de caractères est attendue.`);
    if (value.length > MAX_CONFIG_VALUE_LENGTH) {
      throw invalid(name, `${name} : ${MAX_CONFIG_VALUE_LENGTH} caractères au plus.`);
    }
  }
}

/**
 * Contrôle les valeurs envoyées pour une rubrique et les renvoie normalisées
 * (espaces retirés, entier réécrit, barre finale d'une URL retirée). Lève une
 * `AppException` en français au premier problème.
 */
export function validateConfigUpdate(
  category: string,
  body: Record<string, unknown>,
  checkLdapFilter: (filter: string) => void,
): Record<string, string> {
  const section = assertConfigCategory(category);
  checkShape(section, body);
  return Object.fromEntries(
    Object.entries(body as Record<string, string>).map(([name, raw]) => {
      const definition = configDefinition(`${section}.${name}` as ConfigKey);
      const value = definition.type === 'secret' ? raw : raw.trim();
      return [name, value === '' ? '' : normalizeValue(name, definition, value, checkLdapFilter)];
    }),
  );
}

/** Un réglage modifié, tel que le journal le retient. */
export type ConfigChange =
  | { key: ConfigKey; label: string; from: string | null; to: string | null }
  | { key: ConfigKey; label: string; secret: true };

/** `details` de l'entrée `config_updated`. Jamais la valeur d'un secret. */
export interface ConfigChangeDetails {
  category: ConfigCategory;
  section: string;
  /** Phrase lisible : « Serveur SMTP : « a » → « b » ; Mot de passe : modifié ». */
  summary: string;
  changes: ConfigChange[];
}

/** Valeur telle que l'écran la présente : un interrupteur se lit « activé » /
 *  « désactivé » (comme sous le champ), jamais « true » / « false ». */
function quoted(key: ConfigKey, value: string | null): string {
  if (value === null) return 'vide';
  if (configDefinition(key).type === 'boolean' && (value === 'true' || value === 'false')) {
    return value === 'true' ? '« activé »' : '« désactivé »';
  }
  return `« ${value} »`;
}

function changeText(change: ConfigChange): string {
  if ('secret' in change) return `${change.label} : modifié`;
  return `${change.label} : ${quoted(change.key, change.from)} → ${quoted(change.key, change.to)}`;
}

/**
 * Changements entre les valeurs en base (`before`, secrets déchiffrés) et les
 * valeurs enregistrées (`after`) ; `null` si rien n'a changé. Une valeur vide
 * et une valeur absente sont équivalentes. Un secret n'est noté que
 * « modifié » : ni l'ancienne ni la nouvelle valeur ne sortent d'ici.
 */
export function describeConfigChanges(
  category: ConfigCategory,
  before: Readonly<Record<string, string | null>>,
  after: Readonly<Record<string, string>>,
): ConfigChangeDetails | null {
  const changes = Object.entries(after).flatMap(([name, value]): ConfigChange[] => {
    const key = `${category}.${name}` as ConfigKey;
    const definition = configDefinition(key);
    const from = before[name] || null;
    const to = value || null;
    if (from === to) return [];
    if (definition.type === 'secret') return [{ key, label: definition.label, secret: true }];
    return [{ key, label: definition.label, from, to }];
  });
  if (changes.length === 0) return null;
  return {
    category,
    section: CONFIG_SECTION_LABELS[category],
    summary: changes.map(changeText).join(' ; '),
    changes,
  };
}

/** `details` prêt pour `AuditService.record`. */
export function toAuditDetails(details: ConfigChangeDetails): Prisma.InputJsonObject {
  return {
    category: details.category,
    section: details.section,
    summary: details.summary,
    changes: details.changes.map((change) => ({ ...change })),
  };
}
