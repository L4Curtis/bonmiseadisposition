/**
 * Contrats de l'API — registre de la configuration (`backend/src/config/`).
 *
 * Le registre décrit chaque réglage modifiable dans l'écran Configuration :
 * type, bornes, valeur par défaut, secret ou non, rubrique de santé. La route
 * GET /api/admin/config/registry dit, pour chaque réglage, ce qui est saisi,
 * ce que vaut le défaut, et ce que l'application APPLIQUE réellement.
 */

import type { ConfigCategory } from './admin';
import type { ListResponse } from './common';

/** Type d'un réglage, qui décide de sa lecture et de son contrôle. */
export type ConfigValueType = 'boolean' | 'integer' | 'string' | 'url' | 'email' | 'secret';

/** Valeur typée d'un réglage. */
export type ConfigScalar = string | number | boolean;

/**
 * D'où vient la valeur appliquée :
 *  - `stored` : la valeur saisie dans l'écran ;
 *  - `environment` : une variable d'environnement du serveur (`FRONTEND_URL`
 *    pour l'URL publique) ;
 *  - `default` : la valeur par défaut, faute de saisie utilisable.
 */
export type ConfigValueSource = 'stored' | 'environment' | 'default';

export interface ConfigRegistryEntry {
  /** Clé complète « rubrique.nom » (« retention.audit_logs_years »). */
  key: string;
  category: ConfigCategory;
  /** Nom du réglage dans sa rubrique (« audit_logs_years »). */
  name: string;
  /** Libellé français du champ. */
  label: string;
  type: ConfigValueType;
  /** Bornes d'un entier ; `null` sans borne (et pour les autres types). */
  min: number | null;
  max: number | null;
  /** Valeur chiffrée en base, jamais renvoyée en clair. */
  secret: boolean;
  /** Réservé à l'administrateur. */
  adminOnly: boolean;
  /** Rubrique de GET /admin/config/health où ce réglage compte. */
  healthSection: ConfigCategory;
  /** Valeur saisie en base, telle quelle ; « •••••••• » pour un secret
   *  renseigné ; `null` si rien n'est saisi. */
  storedValue: string | null;
  /** Valeur par défaut, `null` s'il n'y en a pas. */
  defaultValue: ConfigScalar | null;
  /** Valeur réellement appliquée ; « •••••••• » pour un secret renseigné. */
  appliedValue: ConfigScalar | null;
  source: ConfigValueSource;
  /** La valeur saisie n'est pas appliquée telle quelle : illisible (le
   *  défaut s'applique) ou hors bornes (ramenée à la borne). */
  adjusted: boolean;
}

/** GET /api/admin/config/registry — tous les réglages, dans l'ordre de l'écran
 *  (admin uniquement). Liste complète : `page` 1, `limit` = `total`. */
export type ConfigRegistryResponse = ListResponse<ConfigRegistryEntry>;
