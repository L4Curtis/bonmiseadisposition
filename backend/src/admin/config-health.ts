/**
 * Calcule un état de configuration par rubrique pour GET /admin/config/health
 * (voir admin.controller.ts / admin.service.ts). Règle absolue : ne jamais
 * exposer un secret — on ne teste jamais que la PRÉSENCE d'une valeur (une
 * chaîne non vide), jamais son contenu déchiffré.
 *
 * Les clés « indispensables » par rubrique sont celles que les services ne
 * peuvent pas remplacer : un réglage qui a une valeur par défaut au registre
 * (`config/config-registry.ts` : port SMTP, délais, durées…) n'est jamais
 * « indispensable », puisque son absence ne casse rien. Les interrupteurs et
 * la durée des liens sont lus comme les services les lisent (registre :
 * défaut, bornes).
 */
import type { ConfigCategory, ConfigHealthSection } from '../contracts/admin';
import { BooleanConfigKey, configDefinition, resolveConfigValue } from '../config/config-registry';

export type { ConfigHealthSection, ConfigHealthState } from '../contracts/admin';

/** Ligne de configuration minimale nécessaire au calcul — jamais la valeur déchiffrée. */
export interface ConfigHealthRow {
  category: string;
  key: string;
  value: string | null;
  updatedAt: Date;
}

/** Catégories couvertes par la vue d'ensemble, dans l'ordre du menu de configuration. */
export const CONFIG_HEALTH_CATEGORIES = [
  'general', 'ldap', 'entra', 'smtp', 'rappels', 'tokens', 'smb', 'timestamp', 'retention',
] as const satisfies readonly ConfigCategory[];

interface RequiredField {
  key: string;
  label: string;
}

interface SectionMessages {
  nonConfigure: string;
  desactive?: string;
  incomplet: (missing: string[]) => string;
  configure: string;
}

interface SectionRule {
  key: ConfigCategory;
  label: string;
  /** Clé de l'interrupteur d'activation, quand la rubrique peut être désactivée. */
  toggleKey?: string;
  /** Clés indispensables une fois la rubrique active. */
  required: RequiredField[];
  messages: SectionMessages;
}

const SECTION_RULES: Record<string, SectionRule> = {
  ldap: {
    key: 'ldap',
    label: 'Active Directory',
    toggleKey: 'enabled',
    required: [
      { key: 'url', label: 'URL LDAP' },
      { key: 'search_base', label: 'Search Base' },
      { key: 'bind_dn', label: 'Bind DN (compte de connexion)' },
      { key: 'bind_password', label: 'mot de passe de connexion' },
    ],
    messages: {
      nonConfigure: "Active Directory jamais configuré : les comptes collaborateurs doivent être créés manuellement.",
      desactive: "Synchronisation Active Directory désactivée : les comptes doivent être créés et mis à jour manuellement.",
      incomplet: (missing) => `Active Directory incomplet (${missing.join(', ')} manquant(s)) : la synchronisation échouera.`,
      configure: "Active Directory configuré : la synchronisation des comptes est active.",
    },
  },
  entra: {
    key: 'entra',
    label: 'Entra ID',
    required: [
      { key: 'tenant_id', label: 'Tenant ID' },
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client Secret' },
      { key: 'admin_group_id', label: 'groupe Admin' },
      { key: 'technician_group_id', label: 'groupe Technicien' },
    ],
    messages: {
      nonConfigure: "Entra ID non configuré : seule la connexion locale est disponible, pas de SSO Microsoft.",
      incomplet: (missing) => `Entra ID incomplet (${missing.join(', ')} manquant(s)) : la connexion SSO échouera ou les rôles ne seront pas attribués.`,
      configure: "Entra ID configuré : la connexion SSO Microsoft est disponible.",
    },
  },
  smtp: {
    key: 'smtp',
    label: 'Email / SMTP',
    required: [
      { key: 'host', label: 'serveur SMTP' },
      { key: 'from', label: 'adresse d’expéditeur' },
    ],
    messages: {
      nonConfigure: "SMTP non configuré : aucun email n'est envoyé, seule la signature présentielle fonctionne.",
      incomplet: (missing) => `SMTP incomplet (${missing.join(', ')} manquant(s)) : aucun lien de signature ne part, seule la signature présentielle fonctionne.`,
      configure: "SMTP configuré : les emails (demandes de signature, rappels) sont envoyés.",
    },
  },
  rappels: {
    key: 'rappels',
    label: 'Rappels',
    toggleKey: 'enabled',
    required: [],
    messages: {
      nonConfigure: "Rappels jamais configurés : aucune relance automatique n'est envoyée.",
      desactive: "Rappels désactivés : aucune relance automatique n'est envoyée aux collaborateurs.",
      incomplet: () => "Rappels incomplets.",
      configure: "Rappels actifs : relances automatiques envoyées selon les délais configurés (ou leurs valeurs par défaut).",
    },
  },
  smb: {
    key: 'smb',
    label: 'Export SMB',
    toggleKey: 'enabled',
    required: [{ key: 'path', label: 'chemin UNC ou montage local' }],
    messages: {
      nonConfigure: "Export SMB jamais configuré : les bons ne sont pas copiés vers un partage réseau.",
      desactive: "Export SMB désactivé : les bons ne sont pas copiés vers un partage réseau.",
      incomplet: (missing) => `Export SMB incomplet (${missing.join(', ')} manquant(s)) : les exports échoueront.`,
      configure: "Export SMB actif : chaque bon signé est copié vers le partage réseau configuré.",
    },
  },
  timestamp: {
    key: 'timestamp',
    label: 'Horodatage',
    toggleKey: 'enabled',
    required: [{ key: 'tsa_url', label: "URL de l'autorité d'horodatage (TSA)" }],
    messages: {
      nonConfigure: "Horodatage jamais configuré : les signatures ne portent pas de jeton RFC 3161 (scellées par HMAC uniquement).",
      desactive: "Horodatage désactivé : les signatures ne portent pas de jeton RFC 3161 (scellées par HMAC uniquement).",
      incomplet: (missing) => `Horodatage incomplet (${missing.join(', ')} manquant(e)) : l'horodatage est ignoré à chaque signature.`,
      configure: "Horodatage actif : chaque signature reçoit un jeton RFC 3161.",
    },
  },
  retention: {
    key: 'retention',
    label: 'Rétention RGPD',
    toggleKey: 'enabled',
    required: [],
    messages: {
      nonConfigure: "Rétention RGPD jamais configurée : l'anonymisation automatique est inactive.",
      desactive: "Anonymisation automatique désactivée : les bons anciens ne sont pas anonymisés automatiquement.",
      incomplet: () => "Rétention RGPD incomplète.",
      configure: "Anonymisation automatique active selon les durées configurées (valeurs par défaut légales sinon).",
    },
  },
};

function present(values: Map<string, string>, key: string): boolean {
  const v = values.get(key);
  return v !== undefined && v.trim() !== '';
}

function maxUpdatedAt(rows: ConfigHealthRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), rows[0].updatedAt).toISOString();
}

/** Interrupteur tel que les services le lisent : rien de saisi = valeur par défaut. */
function isSwitchedOn(rule: SectionRule, values: Map<string, string>): boolean {
  const key = `${rule.key}.${rule.toggleKey}` as BooleanConfigKey;
  return resolveConfigValue(configDefinition(key), values.get(rule.toggleKey ?? '') ?? null).applied === true;
}

function computeGenericSection(rule: SectionRule, rows: ConfigHealthRow[]): ConfigHealthSection {
  const updatedAt = maxUpdatedAt(rows);
  const base = { key: rule.key, label: rule.label, updatedAt };

  const values = new Map(rows.map((r) => [r.key, r.value ?? '']));

  // Rien d'enregistré : la rubrique fonctionne quand même si elle est active
  // par défaut et n'a besoin d'aucune saisie (rappels) ; sinon, jamais configurée.
  const worksByDefault = !!rule.toggleKey && rule.required.length === 0 && isSwitchedOn(rule, values);
  if (rows.length === 0 && !worksByDefault) {
    return { ...base, state: 'non_configure', detail: rule.messages.nonConfigure };
  }

  if (rule.toggleKey && !isSwitchedOn(rule, values)) {
    return { ...base, state: 'desactive', detail: rule.messages.desactive ?? rule.messages.nonConfigure };
  }

  const missing = rule.required.filter((f) => !present(values, f.key));
  if (missing.length > 0) {
    return { ...base, state: 'incomplet', detail: rule.messages.incomplet(missing.map((f) => f.label)) };
  }

  return { ...base, state: 'configure', detail: rule.messages.configure };
}

/** Rubrique « Général » : cas particulier — `app_url` a un repli fonctionnel
 *  (variable d'environnement FRONTEND_URL, cf. resolveAppUrl / entra-sso.ts),
 *  donc son absence en base n'est pas forcément un problème. */
function computeGeneralSection(rows: ConfigHealthRow[], frontendUrlEnv?: string): ConfigHealthSection {
  const updatedAt = maxUpdatedAt(rows);
  const appUrlRow = rows.find((r) => r.key === 'app_url' && r.value && r.value.trim() !== '');

  if (appUrlRow) {
    return { key: 'general', label: 'Général', state: 'configure', detail: "URL publique de l'application configurée.", updatedAt };
  }
  if (frontendUrlEnv && frontendUrlEnv.trim() !== '') {
    return {
      key: 'general',
      label: 'Général',
      state: 'configure',
      detail: "URL publique reprise automatiquement de la variable d'environnement FRONTEND_URL.",
      updatedAt,
    };
  }
  return {
    key: 'general',
    label: 'Général',
    state: rows.length === 0 ? 'non_configure' : 'incomplet',
    detail: "URL publique non définie : les liens envoyés par email utiliseront une adresse par défaut peu fiable.",
    updatedAt,
  };
}

/** Rubrique « Tokens » : la durée des liens a un défaut et des bornes au
 *  registre — jamais bloquante, donc toujours « configurée », avec la valeur
 *  réellement appliquée dans le détail. */
function computeTokensSection(rows: ConfigHealthRow[]): ConfigHealthSection {
  const updatedAt = maxUpdatedAt(rows);
  const stored = rows.find((r) => r.key === 'expiry_days')?.value ?? null;
  const resolved = resolveConfigValue(configDefinition('tokens.expiry_days'), stored);
  return {
    key: 'tokens',
    label: 'Tokens',
    state: 'configure',
    detail:
      resolved.source === 'stored'
        ? `Durée de validité des liens de signature personnalisée (${resolved.applied} jour(s)).`
        : `Durée de validité des liens de signature par défaut (${resolved.applied} jours).`,
    updatedAt,
  };
}

export function computeConfigHealth(
  rows: ConfigHealthRow[],
  options: { frontendUrlEnv?: string } = {},
): ConfigHealthSection[] {
  const byCategory = new Map<string, ConfigHealthRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  return CONFIG_HEALTH_CATEGORIES.map((key) => {
    const categoryRows = byCategory.get(key) ?? [];
    if (key === 'general') return computeGeneralSection(categoryRows, options.frontendUrlEnv);
    if (key === 'tokens') return computeTokensSection(categoryRows);
    const rule = SECTION_RULES[key as keyof typeof SECTION_RULES];
    return computeGenericSection(rule, categoryRows);
  });
}
