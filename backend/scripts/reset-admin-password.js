#!/usr/bin/env node
/**
 * Réinitialise le mot de passe du compte local admin@local.
 *
 * Usage (dans le conteneur backend, qui possède DATABASE_URL) :
 *   docker exec -i <conteneur-backend> node scripts/reset-admin-password.js 'MotDePasseTemporaire!2026'
 *
 * Effets : nouveau hash bcrypt, changement de mot de passe obligatoire à la
 * prochaine connexion, compte réactivé, sessions existantes invalidées
 * (passwordChangedAt). Rien n'est écrit dans les logs.
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const EMAIL = process.env.ADMIN_EMAIL || 'admin@local';
const MIN_LENGTH = 12;

async function main() {
  const pwd = process.argv[2];
  if (!pwd || pwd.length < MIN_LENGTH) {
    console.error(`Usage : node scripts/reset-admin-password.js '<mot de passe temporaire>' (${MIN_LENGTH} caractères minimum)`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(pwd, 12);
    const user = await prisma.user.update({
      where: { email: EMAIL },
      data: { passwordHash: hash, mustChangePassword: true, passwordChangedAt: new Date(), active: true, isLocalAccount: true },
      select: { email: true },
    });
    console.log(`OK : ${user.email} — mot de passe réinitialisé, changement obligatoire à la prochaine connexion.`);
  } catch (err) {
    const message = err && err.code === 'P2025' ? `Compte ${EMAIL} introuvable` : (err && err.message) || String(err);
    console.error(`Échec : ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
