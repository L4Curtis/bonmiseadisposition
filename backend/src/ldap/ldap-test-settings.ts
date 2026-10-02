/**
 * Réglages utilisés par le test de connexion LDAP de l'écran Configuration :
 * les valeurs saisies dans le formulaire l'emportent sur celles enregistrées,
 * sans jamais être enregistrées. Fonction pure : ne lit ni n'écrit rien.
 *
 *  - un champ absent de la saisie reprend la valeur enregistrée ;
 *  - un champ saisi vide vaut comme s'il était enregistré vide : la valeur
 *    par défaut du registre s'applique (filtre par défaut, SSL désactivé),
 *    et une URL vide est signalée comme manquante ;
 *  - le mot de passe, vide ou masqué, reprend celui qui est enregistré (il
 *    n'est jamais renvoyé à l'écran), mais SEULEMENT vers le serveur et le
 *    compte enregistrés, sans retirer le SSL : sinon un test vers une adresse
 *    saisie livrerait le mot de passe du compte de service à n'importe quel
 *    serveur, ou en clair sur le réseau. Il faut alors le retaper
 *    (`storedPasswordWithheld`).
 */
import { configDefinition, resolveConfigValue } from '../config/config-registry';
import type { StringConfigKey } from '../config/config-registry';
import { SECRET_MASK } from '../config/config-registry.service';
import type { LdapTestDto } from './dto/ldap-test.dto';

export interface LdapConnectionSettings {
  readonly url: string | null;
  readonly useSsl: boolean;
  readonly bindDn: string | null;
  readonly bindPassword: string | null;
  readonly userFilter: string | null;
}

/** Réglages du test, et si le mot de passe enregistré a été retenu. */
export interface LdapTestSettings extends LdapConnectionSettings {
  readonly storedPasswordWithheld: boolean;
}

function sameTarget(a: string | null, b: string | null): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** Le mot de passe enregistré peut-il partir vers ces réglages ? */
function storedPasswordAllowed(settings: LdapConnectionSettings, stored: LdapConnectionSettings): boolean {
  const sslKept = settings.useSsl || !stored.useSsl;
  return sameTarget(settings.url, stored.url) && sameTarget(settings.bindDn, stored.bindDn) && sslKept;
}

function typedText(key: StringConfigKey, typed: string | undefined, stored: string | null): string | null {
  if (typed === undefined) return stored;
  const applied = resolveConfigValue(configDefinition(key), typed).applied;
  return typeof applied === 'string' ? applied : null;
}

function isRetyped(typed: string | undefined): typed is string {
  return typed !== undefined && typed !== '' && typed !== SECRET_MASK;
}

export function resolveLdapTestSettings(typed: LdapTestDto, stored: LdapConnectionSettings): LdapTestSettings {
  const target = {
    url: typedText('ldap.url', typed.url, stored.url),
    useSsl:
      typed.use_ssl === undefined
        ? stored.useSsl
        : resolveConfigValue(configDefinition('ldap.use_ssl'), typed.use_ssl).applied === true,
    bindDn: typedText('ldap.bind_dn', typed.bind_dn, stored.bindDn),
    userFilter: typedText('ldap.user_filter', typed.user_filter, stored.userFilter),
  };
  if (isRetyped(typed.bind_password)) return { ...target, bindPassword: typed.bind_password, storedPasswordWithheld: false };
  const allowed = storedPasswordAllowed({ ...target, bindPassword: null }, stored);
  return { ...target, bindPassword: allowed ? stored.bindPassword : null, storedPasswordWithheld: !allowed && !!stored.bindPassword };
}
