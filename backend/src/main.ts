import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { configureApp, resolveCorsOrigin } from './bootstrap/configure-app';
import { AppConfigService } from './config/config.service';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Validation des secrets AU DÉMARRAGE : un JWT_SECRET manquant ne doit pas
  // se découvrir en production via des 500 sur le login — le conteneur refuse
  // de démarrer avec un message explicite dans les logs.
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET est requis et doit faire au moins 32 caractères. Générer : openssl rand -hex 32',
    );
  }
  if (jwtSecret === process.env.ENCRYPTION_KEY) {
    throw new Error('JWT_SECRET doit être différent de ENCRYPTION_KEY (surfaces d\'attaque isolées)');
  }

  // The cron package does not catch rejected promises from @Cron callbacks —
  // log them instead of letting the process die on unhandledRejection.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : reason}`);
  });

  const app = await NestFactory.create(AppModule);

  // Configuration HTTP partagée avec les tests de contrat
  // (bootstrap/configure-app.ts) : préfixe, proxy, CSRF, CORS, en-têtes,
  // validation, filtre d'erreurs.
  configureApp(app, { corsOrigin: resolveCorsOrigin() });
  app.enableShutdownHooks();

  // Initialise les modules (déclenche les hooks onModuleInit) AVANT d'écouter :
  // c'est onModuleInit — pas le constructeur — qui dérive la clé de chiffrement,
  // et il ne tourne qu'à init()/listen(). Sans ce init() explicite, le canari
  // ci-dessous appellerait encrypt() avec une clé encore indéfinie.
  await app.init();

  // Canari ENCRYPTION_KEY : fail-fast AVANT d'écouter si la clé a changé depuis
  // la 1re init (sinon démarrage silencieux avec données chiffrées illisibles).
  await app.get(AppConfigService).verifyEncryptionCanary();

  await app.listen(4000);
  logger.log('Backend running on http://localhost:4000');

  // Ensure default local admin exists. Isolé APRÈS listen : un hoquet DB
  // transitoire ici ne doit pas tuer un serveur HTTP déjà fonctionnel
  // (l'admin par défaut sera recréé au prochain redémarrage).
  try {
    const authService = app.get(AuthService);
    await authService.ensureDefaultAdmin();
  } catch (err) {
    logger.error(`ensureDefaultAdmin a échoué (serveur conservé): ${err instanceof Error ? err.message : err}`);
  }
}

// Fail-fast AVANT que le serveur écoute : un échec de démarrage (DB
// indisponible, config invalide) doit TUER le process pour que Docker le
// redémarre — sans ce catch, le handler unhandledRejection ci-dessus
// loggerait l'erreur en laissant un process zombie qui n'écoute jamais
// (conteneur « running » mais 502 permanent).
bootstrap().catch((err) => {
  logger.error(`Échec du démarrage: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
