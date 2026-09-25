import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Route ouverte SANS session : connexion (locale et SSO), rafraîchissement de
 * session par cookie, santé du service. Toute autre route doit porter
 * `@Roles(...)` : RolesGuard refuse par défaut une route qui n'a ni l'un ni
 * l'autre (voir docs/security.md, « Modèle d'accès »).
 *
 * Une route `@Public()` ne doit jamais passer par JwtAuthGuard, qui exigerait
 * une session : le test d'inventaire des routes (auth/__tests__/route-access.spec.ts)
 * refuse cette contradiction.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
