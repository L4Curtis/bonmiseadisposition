import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Longueur maximale d'une valeur, comme à l'enregistrement de la configuration. */
const MAX_LENGTH = 2000;

const maxLength = (label: string) =>
  MaxLength(MAX_LENGTH, { message: `${label} : ${MAX_LENGTH} caractères au plus.` });

/**
 * POST /admin/config/test/ldap : les valeurs SAISIES dans l'écran Active
 * Directory, enregistrées ou non, pour tester ce que l'administrateur voit.
 * Rien n'est enregistré. Un champ absent reprend la valeur enregistrée ; un
 * mot de passe vide ou masqué (« •••••••• ») aussi, pour ne pas obliger à le
 * retaper à chaque test.
 */
export class LdapTestDto {
  @IsOptional()
  @IsString({ message: 'URL LDAP : une chaîne de caractères est attendue.' })
  @maxLength('URL LDAP')
  @Matches(/^(ldaps?:\/\/\S+)?$/i, { message: 'URL LDAP : une adresse ldap:// ou ldaps:// est attendue.' })
  url?: string;

  @IsOptional()
  @IsIn(['true', 'false', ''], { message: 'SSL/TLS : « true » ou « false » attendu.' })
  use_ssl?: string;

  @IsOptional()
  @IsString({ message: 'Bind DN : une chaîne de caractères est attendue.' })
  @maxLength('Bind DN')
  bind_dn?: string;

  @IsOptional()
  @IsString({ message: 'Mot de passe : une chaîne de caractères est attendue.' })
  @maxLength('Mot de passe')
  bind_password?: string;

  @IsOptional()
  @IsString({ message: 'Filtre utilisateurs : une chaîne de caractères est attendue.' })
  @maxLength('Filtre utilisateurs')
  user_filter?: string;
}
