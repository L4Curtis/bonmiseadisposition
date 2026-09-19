#!/usr/bin/env node
/**
 * Assainit une base de développement locale des VRAIS secrets qui auraient pu
 * y être saisis par erreur (identifiants SMTP Office 365 de production,
 * secrets Entra/Graph, mot de passe de liaison LDAP, mot de passe SMB…).
 *
 * Contexte : la configuration applicative vit en base (table `app_config`,
 * cf. backend/src/config/), certaines valeurs y sont chiffrées en
 * AES-256-GCM avec ENCRYPTION_KEY (backend/src/config/encryption.service.ts).
 * Une base de dev n'a aucune raison de contenir un secret qui fonctionne
 * réellement contre un système de production.
 *
 * Effets :
 *   - Supprime (ligne effacée de app_config) les clés secrètes réelles :
 *     smtp.password, smtp.user, entra.client_secret, ldap.bind_password,
 *     smb.password. Liste dérivée du code, pas devinée : cf. `getEncryptedKeys`
 *     dans backend/src/admin/admin.controller.ts (clés chiffrées par
 *     l'application) + smtp.user (identifiant réel non chiffré mais tout
 *     aussi sensible que le mot de passe qui va avec).
 *   - Désactive LDAP et l'export SMB (ldap.enabled / smb.enabled = "false") :
 *     ces fonctionnalités ne peuvent plus fonctionner sans les secrets
 *     ci-dessus, autant éviter des tentatives de connexion vouées à échouer.
 *     L'authentification locale (admin@local) n'est pas touchée.
 *   - Repointe le SMTP vers Mailpit (docker-compose.dev.yml) : host=localhost,
 *     port=1025, secure=false, from=bons-dev@localhost.test. Plus aucun email
 *     de dev ne peut sortir vers une vraie boîte.
 *
 * Garde-fou : refuse de s'exécuter si NODE_ENV=production ou si l'hôte de
 * DATABASE_URL n'est pas localhost/127.0.0.1/::1 (cf. assertLocalDevEnvironment,
 * exportée et testée séparément — voir backend/src/__tests__/dev-scrub-secrets.spec.ts).
 *
 * N'affiche jamais aucune valeur, uniquement les clés modifiées/supprimées.
 * Idempotent : rejouable sans effet si déjà passé.
 *
 * Usage (même style que reset-admin-password.js) :
 *   node scripts/dev-scrub-secrets.js
 */
const { PrismaClient } = require('@prisma/client');

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Garde-fou PUR (aucun accès réseau/Prisma) : détermine si ce script peut
 * s'exécuter sans risque contre l'environnement décrit par `env`.
 * @param {{ nodeEnv: string | undefined, databaseUrl: string | undefined }} env
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function assertLocalDevEnvironment(env) {
  const { nodeEnv, databaseUrl } = env;

  if (nodeEnv === 'production') {
    return {
      ok: false,
      reason: 'NODE_ENV=production : ce script ne doit jamais être exécuté en production.',
    };
  }

  if (!databaseUrl) {
    return {
      ok: false,
      reason: 'DATABASE_URL est absent : impossible de vérifier que la base ciblée est locale.',
    };
  }

  let host;
  try {
    // new URL(...).hostname conserve les crochets pour l'IPv6 (ex. "[::1]") :
    // on les retire pour comparer à la forme nue "::1".
    host = new URL(databaseUrl).hostname.replace(/^\[(.+)\]$/, '$1');
  } catch {
    return { ok: false, reason: `DATABASE_URL illisible (URL invalide) : "${databaseUrl}".` };
  }

  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    return {
      ok: false,
      reason:
        `L'hôte de DATABASE_URL ("${host}") n'est ni localhost, ni 127.0.0.1, ni ::1. ` +
        'Abandon par sécurité : ce script ne doit jamais toucher une base distante.',
    };
  }

  return { ok: true };
}

// ── Clés secrètes réelles à supprimer ──────────────────────────────────────
// Dérivées de `getEncryptedKeys()` dans backend/src/admin/admin.controller.ts
// (clés que l'application chiffre avec ENCRYPTION_KEY) : ce sont les seules
// clés que ConfigService/AdminService considèrent comme des secrets.
const ENCRYPTED_CONFIG_KEYS = [
  { category: 'ldap', key: 'bind_password' },
  { category: 'entra', key: 'client_secret' }, // secret client Entra, utilisé aussi pour Microsoft Graph
  { category: 'smtp', key: 'password' },
  { category: 'smb', key: 'password' },
];

// Non chiffrée en base, mais porte une identité réelle (compte de messagerie
// Office 365) au même titre que le mot de passe associé : à supprimer avec.
const ADDITIONAL_SENSITIVE_KEYS = [{ category: 'smtp', key: 'user' }];

const SECRET_KEYS_TO_DELETE = [...ENCRYPTED_CONFIG_KEYS, ...ADDITIONAL_SENSITIVE_KEYS];

// ── Fonctionnalités qui ne peuvent plus marcher sans les secrets ci-dessus ─
// (catégorie, clé, valeur attendue). L'authentification locale n'est pas
// concernée : elle ne dépend d'aucun de ces secrets.
const FEATURES_TO_DISABLE = [
  { category: 'ldap', key: 'enabled', value: 'false' },
  { category: 'smb', key: 'enabled', value: 'false' },
];

// ── SMTP repointé vers Mailpit (docker-compose.dev.yml) ────────────────────
// Domaine avec un point : exigé par isDeliverableEmail (backend/src/common/email.ts)
// et par la validation de smtp.from côté admin.
const SMTP_REDIRECT_TO_MAILPIT = [
  { category: 'smtp', key: 'host', value: 'localhost' },
  { category: 'smtp', key: 'port', value: '1025' },
  { category: 'smtp', key: 'secure', value: 'false' },
  { category: 'smtp', key: 'from', value: 'bons-dev@localhost.test' },
];

/** Supprime la ligne app_config si elle existe et porte une valeur non vide.
 *  Retourne le libellé du changement, ou null si rien à faire (idempotent). */
async function deleteSecretIfPresent(prisma, { category, key }) {
  const existing = await prisma.appConfig.findUnique({
    where: { category_key: { category, key } },
  });
  if (!existing || !existing.value) return null;

  await prisma.appConfig.delete({ where: { category_key: { category, key } } });
  return `${category}.${key} (supprimée)`;
}

/** Impose la valeur donnée si elle diffère de la valeur actuelle. Retourne le
 *  libellé du changement, ou null si déjà à jour (idempotent). Ces clés ne
 *  sont jamais chiffrées (drapeaux et réglages SMTP non sensibles). */
async function setPlainValueIfDifferent(prisma, { category, key, value }) {
  const existing = await prisma.appConfig.findUnique({
    where: { category_key: { category, key } },
  });
  if (existing && existing.value === value && existing.encrypted === false) return null;

  await prisma.appConfig.upsert({
    where: { category_key: { category, key } },
    update: { value, encrypted: false },
    create: { category, key, value, encrypted: false },
  });
  return `${category}.${key} (modifiée)`;
}

async function scrubSecrets(prisma) {
  const changes = [];

  for (const target of SECRET_KEYS_TO_DELETE) {
    const change = await deleteSecretIfPresent(prisma, target);
    if (change) changes.push(change);
  }

  for (const target of FEATURES_TO_DISABLE) {
    const change = await setPlainValueIfDifferent(prisma, target);
    if (change) changes.push(change);
  }

  for (const target of SMTP_REDIRECT_TO_MAILPIT) {
    const change = await setPlainValueIfDifferent(prisma, target);
    if (change) changes.push(change);
  }

  return changes;
}

async function main() {
  const guard = assertLocalDevEnvironment({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!guard.ok) {
    console.error(`Refus d'exécution : ${guard.reason}`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const changes = await scrubSecrets(prisma);
    if (changes.length === 0) {
      console.log('Rien à assainir : aucune clé secrète ou obsolète trouvée (déjà passé, ou base neuve).');
      return;
    }
    console.log(`Assainissement terminé — ${changes.length} clé(s) modifiée(s)/supprimée(s) (valeurs jamais affichées) :`);
    for (const change of changes) {
      console.log(`  - ${change}`);
    }
  } catch (err) {
    console.error(`Échec de l'assainissement : ${(err && err.message) || String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  assertLocalDevEnvironment,
  scrubSecrets,
  SECRET_KEYS_TO_DELETE,
  FEATURES_TO_DISABLE,
  SMTP_REDIRECT_TO_MAILPIT,
};

if (require.main === module) {
  main();
}
