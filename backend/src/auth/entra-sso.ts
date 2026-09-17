import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfidentialClientApplication, AuthorizationCodeRequest } from '@azure/msal-node';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './utils/normalize-email.util';
import { AccountConflictException } from './exceptions';

export interface EntraSsoDeps {
  configService: AppConfigService;
  prisma: PrismaService;
  logger: Logger;
  /** Émission des tokens de session — fournie par la façade (session-tokens.ts + JwtService). */
  createTokens: (user: {
    id: string;
    email: string;
    role: string;
  }) => Promise<{ accessToken: string; refreshToken: string }>;
  /** Recalcule et persiste le rôle depuis les groupes Entra — reste une méthode
   *  de AuthService (role-mapping.ts + prisma.user.update) car un test unitaire
   *  y accède directement via un cast privé ; injectée ici pour éviter toute
   *  duplication de logique. */
  syncRoleFromGroups: (userId: string, groups: string[]) => Promise<void>;
}

/** Build MSAL ConfidentialClientApplication from DB config */
async function getMsalClient(deps: Pick<EntraSsoDeps, 'configService'>): Promise<ConfidentialClientApplication> {
  const tenantId = await deps.configService.get('entra', 'tenant_id');
  const clientId = await deps.configService.get('entra', 'client_id');
  const clientSecret = await deps.configService.get('entra', 'client_secret');

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Entra ID configuration incomplete. Please configure in admin panel.');
  }

  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });
}

/** Redirect URI Entra : valeur explicite si configurée, sinon dérivée
 *  automatiquement de l'URL publique (general.app_url puis FRONTEND_URL) —
 *  plus besoin de la saisir à la main dans la majorité des déploiements. */
async function getRedirectUri(deps: Pick<EntraSsoDeps, 'configService'>): Promise<string> {
  const explicit = await deps.configService.get('entra', 'redirect_uri');
  if (explicit) return explicit;
  const appUrl = (await deps.configService.get('general', 'app_url')) || process.env.FRONTEND_URL;
  if (appUrl) return `${appUrl.replace(/\/+$/, '')}/api/auth/callback`;
  return 'http://localhost:4000/api/auth/callback';
}

export async function getLoginUrl(
  deps: Pick<EntraSsoDeps, 'configService'>,
  state: string,
  prompt?: string,
): Promise<{ url: string; codeVerifier: string }> {
  const msalClient = await getMsalClient(deps);
  const redirectUri = await getRedirectUri(deps);

  // PKCE: generate code verifier and challenge (RFC 7636)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const url = await msalClient.getAuthCodeUrl({
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri,
    state,
    responseMode: 'query',
    codeChallenge,
    codeChallengeMethod: 'S256',
    // Seule la valeur 'select_account' est acceptée depuis la requête HTTP
    // (liste blanche) — force l'écran de sélection de compte Microsoft au
    // lieu du SSO silencieux, utile pour changer de compte sans se déconnecter
    // de Windows/Microsoft 365.
    ...(prompt === 'select_account' ? { prompt: 'select_account' } : {}),
  });

  return { url, codeVerifier };
}

/**
 * Échange le code d'autorisation OIDC contre une session applicative :
 * résolution/création de l'utilisateur, mapping des claims de groupes vers un
 * rôle, puis émission des tokens. Extrait de AuthService.handleCallback sans
 * changement de comportement.
 */
export async function handleCallback(
  deps: EntraSsoDeps,
  code: string,
  state: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string } }> {
  const msalClient = await getMsalClient(deps);
  const redirectUri = await getRedirectUri(deps);

  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri,
    state,
    codeVerifier,
  };

  const response = await msalClient.acquireTokenByCode(tokenRequest);

  if (!response || !response.account) {
    throw new UnauthorizedException('Failed to authenticate with Microsoft');
  }

  const email = normalizeEmail(response.account.username);
  const displayName = response.account.name || email;

  // Recherche insensible à la casse : SSO et LDAP peuvent renvoyer la même
  // adresse avec une casse différente (LOT C bug #6) — findUnique({email})
  // sur la colonne (sensible à la casse) créerait un doublon et finirait en
  // P2002 sur la contrainte unique, ou pire, deux identités pour la même
  // personne.
  let user = await deps.prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (user) {
    const updateData: Prisma.UserUpdateInput = {};
    if (user.email !== email) updateData.email = email;
    if (!user.displayName) updateData.displayName = displayName;
    if (Object.keys(updateData).length > 0) {
      user = await deps.prisma.user.update({ where: { id: user.id }, data: updateData });
    }
  } else {
    // Create minimal user record — LDAP sync will enrich it later.
    // samAccountName = email normalisé complet (unique par construction,
    // comme la colonne email elle-même) — PAS la partie locale
    // (email.split('@')[0]) : celle-ci peut entrer en collision avec un
    // sAMAccountName LDAP existant pour une personne différente (ex. LDAP
    // "jdupont" vs SSO "jdupont@domaine.fr"), ce qui faisait échouer la
    // création avec un P2002 remonté comme un auth_failed générique
    // (LOT C bug #4).
    try {
      user = await deps.prisma.user.create({
        data: {
          samAccountName: email,
          displayName,
          email,
          role: 'collaborator',
          active: true,
        },
      });
    } catch (err: unknown) {
      const isUniqueConstraintViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (isUniqueConstraintViolation) {
        // Résiduel : création concurrente (deux callbacks SSO simultanés
        // pour le même utilisateur) ou collision imprévue. Le contrôleur
        // distingue ce cas (error=account_conflict) de l'échec générique.
        deps.logger.warn(`SSO ${email}: création en conflit (P2002 résiduel) — probable création concurrente`);
        throw new AccountConflictException('Conflit lors de la création du compte SSO');
      }
      throw err;
    }
  }

  // Offboarded accounts must not get a session even if Entra still authenticates them
  if (!user.active) {
    throw new UnauthorizedException('Compte désactivé');
  }

  // Check group membership for role elevation. When the groups claim is absent
  // (claim not configured, or Entra "group overage" replaces it with
  // _claim_names/_claim_sources), DO NOT downgrade the existing role.
  interface IdTokenClaimsWithGroups {
    groups?: string[];
  }
  const groups = (response.idTokenClaims as IdTokenClaimsWithGroups)?.groups;
  if (groups === undefined) {
    deps.logger.warn(
      `SSO ${email}: claim "groups" absente du id_token (claim non configurée ou group overage) — rôle existant conservé`,
    );
  } else {
    await deps.syncRoleFromGroups(user.id, groups);
  }

  // Re-fetch with updated role
  user = await deps.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  return { ...(await deps.createTokens(user)), user: { id: user.id, email: user.email } };
}
