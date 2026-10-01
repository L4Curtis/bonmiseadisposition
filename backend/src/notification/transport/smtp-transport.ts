import * as nodemailer from 'nodemailer';
import { ConfigRegistryService } from '../../config/config-registry.service';

/** Réglages SMTP appliqués, lus par le registre (port 587 et TLS coupé par défaut). */
export interface SmtpSettings {
  host: string | null;
  port: number;
  user: string | null;
  pass: string | null;
  secure: boolean;
}

/** Lit la configuration SMTP appliquée (défauts et bornes du registre). */
export async function readSmtpSettings(settings: ConfigRegistryService): Promise<SmtpSettings> {
  return {
    host: await settings.getString('smtp.host'),
    port: await settings.getInt('smtp.port'),
    user: await settings.getString('smtp.user'),
    pass: await settings.getString('smtp.password'),
    secure: await settings.getBool('smtp.secure'),
  };
}

/** Aucun expéditeur codé en dur : une config manquante est une erreur explicite,
 *  pas un envoi silencieux depuis un domaine par défaut. */
export async function readFromAddress(settings: ConfigRegistryService): Promise<string> {
  return (await settings.getString('smtp.from')) ?? '';
}

/** Clé de cache dérivée des réglages SMTP courants — un changement de config
 *  (enregistrée depuis l'écran Configuration, qui invalide le cache de configuration)
 *  produit une clé différente et déclenche la reconstruction du transporteur. */
export function buildTransporterCacheKey(settings: SmtpSettings): string {
  return JSON.stringify(settings);
}

/** SmtpSettings dont la présence de "host" a déjà été vérifiée par l'appelant
 *  (ex. NotificationService.getTransporter renvoie null avant d'appeler
 *  buildTransporter si host est absent). */
export type ResolvedSmtpSettings = Omit<SmtpSettings, 'host'> & { host: string };

/**
 * Construit un transporteur nodemailer depuis les réglages SMTP courants.
 * Construction IDENTIQUE au test SMTP (admin/connection-tests.service.ts) : n'active
 * l'auth que si user ET password sont présents. Sinon un relais sans auth
 * (user renseigné, mot de passe vide) passait le test mais échouait à
 * l'envoi réel — tentative d'AUTH avec un mot de passe vide → rejet serveur.
 */
export function buildTransporter(settings: ResolvedSmtpSettings): nodemailer.Transporter {
  const { host, port, user, pass, secure } = settings;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });
}
