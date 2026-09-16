/** Durée de vie maximale d'un mot de passe local avant expiration forcée. */
export const PASSWORD_MAX_AGE_DAYS = 90;

export interface PasswordPolicyUser {
  isLocalAccount: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
}

/**
 * mustChangePassword effectif = flag DB explicite OU mot de passe local expiré
 * (> PASSWORD_MAX_AGE_DAYS jours). Centralisé ici pour que localLogin, /auth/me
 * (via JwtStrategy) et le JwtAuthGuard calculent tous exactement la même chose
 * (LOT C bug #4 : la valeur dérivée par la strategy n'était jamais renvoyée par
 * localLogin, ce qui laissait le front rediriger vers / puis recevoir des 403
 * sur toutes les routes).
 */
export function computeMustChangePassword(user: PasswordPolicyUser): boolean {
  if (user.mustChangePassword) return true;
  if (!user.isLocalAccount || !user.passwordChangedAt) return false;
  const daysSinceChange = (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceChange > PASSWORD_MAX_AGE_DAYS;
}
