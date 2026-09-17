import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../../config/config.service';

/** Réglages SMTP bruts tels que lus depuis AppConfigService (catégorie "smtp"). */
export interface SmtpSettings {
  host: string | null;
  port: string | null;
  user: string | null;
  pass: string | null;
  secure: string | null;
}

/** Lit la config SMTP courante depuis AppConfigService. */
export async function readSmtpSettings(configService: AppConfigService): Promise<SmtpSettings> {
  const host = await configService.get('smtp', 'host');
  const port = await configService.get('smtp', 'port');
  const user = await configService.get('smtp', 'user');
  const pass = await configService.get('smtp', 'password');
  const secure = await configService.get('smtp', 'secure');
  return { host, port, user, pass, secure };
}

/** Aucun expéditeur codé en dur : une config manquante est une erreur explicite,
 *  pas un envoi silencieux depuis un domaine par défaut. */
export async function readFromAddress(configService: AppConfigService): Promise<string> {
  return (await configService.get('smtp', 'from')) || '';
}

/** Clé de cache dérivée des réglages SMTP courants — un changement de config
 *  (via AdminService.bulkSetConfig, qui invalide le cache de configuration)
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
 * Construction IDENTIQUE au test SMTP (admin.service.testSmtp) : n'active
 * l'auth que si user ET password sont présents. Sinon un relais sans auth
 * (user renseigné, mot de passe vide) passait le test mais échouait à
 * l'envoi réel — tentative d'AUTH avec un mot de passe vide → rejet serveur.
 */
export function buildTransporter(settings: ResolvedSmtpSettings): nodemailer.Transporter {
  const { host, port, user, pass, secure } = settings;
  return nodemailer.createTransport({
    host,
    port: port ? parseInt(port) : 587,
    secure: secure === 'true',
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });
}
