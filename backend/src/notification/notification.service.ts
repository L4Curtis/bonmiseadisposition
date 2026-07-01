import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body as emailBody,
  footer,
  quoteBox,
  sectionLabel,
  equipList,
  refBadge,
} from '../templates/email-layout';
import { NotificationBon } from '../common/types';

/** Escape user-supplied strings before embedding in HTML email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  private cachedTransporter: nodemailer.Transporter | null = null;
  private transporterCacheKey: string | null = null;

  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ─── Transport ──────────────────────────────────────────────────────────────
  // No explicit invalidation needed: the transporter cache key is derived from
  // the current SMTP config values, and AdminService.bulkSetConfig invalidates
  // the config cache — a config change therefore rebuilds the transporter.

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const host = await this.configService.get('smtp', 'host');
    const port = await this.configService.get('smtp', 'port');
    const user = await this.configService.get('smtp', 'user');
    const pass = await this.configService.get('smtp', 'password');
    const secure = await this.configService.get('smtp', 'secure');

    if (!host) return null;

    // Build a cache key from current SMTP settings to detect config changes
    const cacheKey = JSON.stringify({ host, port, user, pass, secure });
    if (this.cachedTransporter && this.transporterCacheKey === cacheKey) {
      return this.cachedTransporter;
    }

    this.cachedTransporter = nodemailer.createTransport({
      host,
      port: port ? parseInt(port) : 587,
      secure: secure === 'true',
      // Construction IDENTIQUE au test SMTP (admin.service.testSmtp) : n'active
      // l'auth que si user ET password sont présents. Sinon un relais sans auth
      // (user renseigné, mot de passe vide) passait le test mais échouait à
      // l'envoi réel — tentative d'AUTH avec un mot de passe vide → rejet serveur.
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
    });
    this.transporterCacheKey = cacheKey;
    return this.cachedTransporter;
  }

  private async getFromAddress(): Promise<string> {
    const from = await this.configService.get('smtp', 'from');
    return from || 'noreply@groupelivio.fr';
  }

  private async getAppUrl(): Promise<string> {
    const url = await this.configService.get('general', 'app_url');
    return url || (process.env.FRONTEND_URL ?? 'http://localhost:5173');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        this.logger.warn(`Email non envoyé (SMTP non configuré) → ${to}: ${subject}`);
        return false;
      }
      const from = await this.getFromAddress();
      await transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email envoyé → ${to}: ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Erreur envoi email → ${to}: ${err}`);
      return false;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildEquipList(equipments: NonNullable<NotificationBon['equipments']>): string {
    const items = (equipments ?? [])
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';
  }

  private buildNotReturnedList(equipments: NonNullable<NotificationBon['equipments']>): string {
    const items = (equipments ?? [])
      .filter((eq) => eq.notReturned)
      .sort((a, b) => a.order - b.order)
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : ${escapeHtml(eq.serialNumber)})</span>`
          : '';
        const reason = `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${escapeHtml(eq.notReturnedReason ?? 'Motif non précisé')}</span>`;
        return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial}${reason}</li>`;
      });
    return items.length
      ? items.join('\n')
      : '<li style="padding:8px 0;font-size:14px;color:#A79F94;list-style:none">Voir le procès-verbal en ligne</li>';
  }

  // ─── Email Templates ────────────────────────────────────────────────────────

  async sendMiseDispositionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const dateMise = new Date(bon.dateMiseDisposition ?? new Date()).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const html = await this.templatesService.renderTemplate('mise_disposition_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      DATE_MISE_DISPO: dateMise,
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      EQUIP_LIST: this.buildEquipList(bon.equipments ?? []),
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de mise à disposition à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mise_dispo_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendRestitutionRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    // Only list equipment being returned (returnedAt set), not all bon equipment
    const returnedEquipments = (bon.equipments ?? []).filter((eq) => eq.returnedAt);
    const remainingEquipments = (bon.equipments ?? []).filter((eq) => !eq.returnedAt && !eq.notReturned);
    const equipList = returnedEquipments.length > 0
      ? this.buildEquipList(returnedEquipments)
      : this.buildEquipList(bon.equipments ?? []);

    // Build remaining equipment section HTML for partial restitution
    const remainingSection = remainingEquipments.length > 0
      ? `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#A79F94;text-transform:uppercase;letter-spacing:0.08em">Éléments restants sur ce bon (${remainingEquipments.length})</p>
      <div style="background-color:#F6F3EE;border:1px solid #E2DFD9;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none">${this.buildEquipList(remainingEquipments)}</ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#6B665E;line-height:1.6;background:#F6F3EE;border:1px solid #E2DFD9;border-radius:8px;padding:10px 14px">Ces équipements ne font pas partie de cette restitution et restent attribués.</p>`
      : '';

    const html = await this.templatesService.renderTemplate('restitution_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      EQUIP_LIST: equipList,
      REMAINING_SECTION: remainingSection,
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Bon de restitution à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'restitution_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendSignatureConfirmation(
    bon: NotificationBon,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    // pv_cloture reuses the restitution confirmation template with its own label
    const templateId = type === 'mise_disposition' ? 'confirmation_mise_disposition' : 'confirmation_restitution';
    const typLabel =
      type === 'pv_cloture'
        ? "procès-verbal d'équipements non restitués"
        : type === 'restitution'
          ? 'restitution'
          : 'mise à disposition';

    const html = await this.templatesService.renderTemplate(templateId, {
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      TYPE_LABEL: typLabel,
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Confirmation de signature — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'confirmation',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : 'SMTP non configuré',
      },
    });
  }

  async sendPvClotureRequest(bon: NotificationBon, token: string): Promise<void> {
    const appUrl = await this.getAppUrl();
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';

    const html = await this.templatesService.renderTemplate('pv_cloture_request', {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      SIGNER_URL: `${appUrl}/signer/${token}`,
      NOT_RETURNED_LIST: this.buildNotReturnedList(bon.equipments ?? []),
    });

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `[${bon.reference}] Procès-verbal d'équipements non restitués à signer — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'pv_cloture_request',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Contestation ────────────────────────────────────────────────────────────

  async sendContestationAlert(bon: NotificationBon, contestingUser: { displayName?: string; email?: string }, message: string): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const reference = bon.reference ?? '';
    const userName = contestingUser?.displayName ?? contestingUser?.email ?? '';

    const itStaff = await this.prisma.user.findMany({
      where: { isItStaff: true, active: true },
      select: { email: true },
    });
    if (itStaff.length === 0) return;

    const html = await this.templatesService.renderTemplate('contestation_alert', {
      USER_NAME: escapeHtml(userName),
      REFERENCE: escapeHtml(reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      CONTESTATION_MESSAGE: escapeHtml(message),
    });

    // Subjects are plain text — no HTML escaping (entities would show verbatim)
    const results = await Promise.all(
      itStaff.map((staff) =>
        this.sendEmail(
          staff.email,
          `[CONTESTATION] [${reference}] ${userName} conteste son bon — ${filialeNom}`,
          html,
        ),
      ),
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: itStaff.map((s) => s.email).join(', '),
        type: 'contestation_alert',
        status: results.some(Boolean) ? 'sent' : 'failed',
        errorMessage: results.some(Boolean) ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendContestationResolution(
    bon: NotificationBon,
    collaborateur: { email: string },
    action: 'resolved' | 'rejected',
    resolutionMessage?: string,
  ): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? '';
    const templateId = action === 'resolved' ? 'contestation_resolved' : 'contestation_rejected';

    const html = await this.templatesService.renderTemplate(templateId, {
      REFERENCE: escapeHtml(bon.reference),
      FILIALE_NOM: escapeHtml(filialeNom),
      RESOLUTION_MESSAGE: resolutionMessage ? escapeHtml(resolutionMessage) : '',
    });

    const ok = await this.sendEmail(
      collaborateur.email,
      `[${bon.reference}] Réponse à votre contestation — ${filialeNom}`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: collaborateur.email,
        type: 'contestation_resolution',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Cancel / MarkFound ──────────────────────────────────────────────────────

  async sendCancellationNotice(bon: NotificationBon): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';

    const html = emailWrapper(card(
      brandHeader('Bon annulé', escapeHtml(filialeNom), { text: 'Annulation', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le bon de mise à disposition ${refBadge(escapeHtml(bon.reference))}
        (${escapeHtml(filialeNom)}) a été <strong style="color:#991b1b">annulé</strong>.
        Aucune action n'est attendue de votre part.
      </p>
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
      footer(),
    ));

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — annulé`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'cancellation',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  async sendMarkFoundNotice(bon: NotificationBon, equipmentIds: string[]): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';

    const foundEquipments = (bon.equipments ?? []).filter((eq) =>
      equipmentIds.includes(eq.id),
    );

    const equipLines = foundEquipments
      .map((eq) => {
        const label = eq.catalogItem
          ? escapeHtml(`${eq.catalogItem.brand} ${eq.catalogItem.model}`)
          : escapeHtml(eq.customLabel || 'Équipement');
        const serial = eq.serialNumber
          ? ` (N° série : ${escapeHtml(eq.serialNumber)})`
          : '';
        return `<li style="padding:6px 0;font-size:14px;color:#4A463F;list-style:none">${label}${serial}</li>`;
      })
      .join('\n');

    const equipItems = equipLines
      ? equipLines
      : '<li style="padding:6px 0;font-size:14px;color:#A79F94;list-style:none">Voir le bon en ligne</li>';

    const html = emailWrapper(card(
      brandHeader('Équipement(s) retrouvé(s)', escapeHtml(filialeNom), { text: 'Mise à jour', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4A463F;line-height:1.75">
        Nous vous informons que le ou les équipements suivants, précédemment signalés comme non restitués
        sur le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}),
        ont été <strong style="color:#166534">retrouvés</strong> :
      </p>
      ${sectionLabel('Équipements retrouvés')}
      ${equipList(equipItems, '#f0fdf4', '#bbf7d0')}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous avez des questions, veuillez contacter votre service informatique.
      </p>
      `),
      footer(),
    ));

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — équipement(s) retrouvé(s)`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'mark_found',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Clôture unilatérale ─────────────────────────────────────────────────────

  async sendUnilateralCloseNotice(bon: NotificationBon, reason: string, newStatus: string): Promise<void> {
    const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
    const collabName = bon.collaborateur?.displayName ?? '';
    const civilite = bon.civilite === 'mme' ? 'Madame' : 'Monsieur';
    const outcome =
      newStatus === 'active'
        ? 'la remise du matériel a été constatée et le bon est désormais actif'
        : 'le bon a été clôturé et archivé';

    const html = emailWrapper(card(
      brandHeader('Bon clôturé sans signature', escapeHtml(filialeNom), { text: 'Constat unilatéral', bg: 'rgba(255,255,255,0.18)' }),
      metaStrip([`Réf. <strong style="color:#1B1A18;font-family:monospace">${escapeHtml(bon.reference)}</strong>`]),
      emailBody(`
      <p style="margin:0 0 8px;font-size:16px;color:#1B1A18;font-weight:500">${escapeHtml(civilite)} ${escapeHtml(collabName)},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        En l'absence de signature de votre part, ${outcome} par le service informatique
        pour le bon ${refBadge(escapeHtml(bon.reference))} (${escapeHtml(filialeNom)}).
      </p>
      ${sectionLabel('Motif indiqué')}
      ${quoteBox('#d97706', '#fffbeb', '#fde68a', escapeHtml(reason))}
      <p style="margin:0;font-size:14px;color:#6B665E;line-height:1.6;background:#F6F3EE;border-radius:10px;padding:12px 16px">
        Si vous contestez ce constat, veuillez contacter votre service informatique au plus vite.
      </p>
      `),
      footer(),
    ));

    const ok = await this.sendEmail(
      bon.collaborateurEmail,
      `Bon ${bon.reference} — clôturé sans signature`,
      html,
    );

    await this.prisma.notificationLog.create({
      data: {
        bonId: bon.id,
        recipientEmail: bon.collaborateurEmail,
        type: 'unilateral_closure',
        status: ok ? 'sent' : 'failed',
        errorMessage: ok ? null : "SMTP non configuré ou erreur d'envoi",
      },
    });
  }

  // ─── Cron: Rappels quotidiens ────────────────────────────────────────────────
  // Reads the SAME config category/keys as the admin UI (category "rappels",
  // keys enabled / delay_1 / delay_2 / delay_3). Reminder N is sent once the
  // bon has been pending for delay_N days — staggered, never on consecutive
  // days unless configured that way. Couvre aussi les PV de non-restitution en
  // attente de co-signature (partially_returned).

  private parseDelay(raw: string | null, fallback: number): number {
    const n = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** Durée de validité des liens (tokens.expiry_days, bornée 1–30, défaut 7). */
  private async getTokenValidityDays(): Promise<number> {
    const raw = await this.configService.get('tokens', 'expiry_days');
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 7;
    return Math.min(30, Math.max(1, parsed));
  }

  /**
   * Régénère un token de signature pour un rappel quand le lien précédent a
   * expiré (sans nouveau lien, les rappels au-delà de la validité du token
   * seraient silencieusement inutiles). Reproduit SignatureService.generateToken
   * — importer SignatureService ici créerait un cycle de modules
   * (SignatureModule consomme déjà NotificationService).
   */
  private async regenerateSignatureToken(
    bonId: string,
    type: 'mise_disposition' | 'restitution' | 'pv_cloture',
  ): Promise<{ token: string }> {
    await this.prisma.signature.updateMany({
      where: { bonId, type, signed: false },
      data: { tokenExpiresAt: new Date(0) },
    });
    const validityDays = await this.getTokenValidityDays();
    const sig = await this.prisma.signature.create({
      data: {
        bonId,
        type,
        token: crypto.randomUUID(),
        tokenExpiresAt: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
        isInPerson: false,
        initiatedById: null,
      },
    });
    this.logger.log(`Rappel: token ${type} régénéré pour le bon ${bonId}`);
    return sig;
  }

  @Cron('0 9 * * 1-5') // Lundi–Vendredi à 9h
  async sendDailyReminders(): Promise<void> {
    try {
      await this.runDailyReminders();
    } catch (err) {
      // The cron package does not catch rejected promises — never let this
      // escape as an unhandledRejection
      this.logger.error(`Cron rappels en échec: ${(err as Error).stack ?? err}`);
    }
  }

  private async runDailyReminders(): Promise<void> {
    this.logger.log('Cron rappels démarré');

    const remindersEnabled = await this.configService.get('rappels', 'enabled');
    if (remindersEnabled === 'false') {
      this.logger.log('Rappels désactivés par configuration');
      return;
    }

    const delays = [
      this.parseDelay(await this.configService.get('rappels', 'delay_1'), 3),
      this.parseDelay(await this.configService.get('rappels', 'delay_2'), 7),
      this.parseDelay(await this.configService.get('rappels', 'delay_3'), 14),
    ];
    const maxReminders = delays.length;
    const firstCutoff = new Date(Date.now() - delays[0] * 24 * 60 * 60 * 1000);

    const pendingBons = await this.prisma.bon.findMany({
      where: {
        // partially_returned inclus : PV de non-restitution (ou restitution
        // partielle) en attente de signature — sans rappel, ces bons restaient
        // bloqués en silence indéfiniment
        status: { in: ['sent_mise_dispo', 'sent_restitution', 'partially_returned'] },
        updatedAt: { lt: firstCutoff },
      },
      include: {
        filiale: true,
        collaborateur: { select: { id: true, displayName: true, email: true } },
        // La signature en attente la plus récente, MÊME si son token a expiré
        // naturellement : elle porte le type du document attendu, et le token
        // sera régénéré. Le filtre tokenExpiresAt > epoch exclut les lignes
        // invalidées VOLONTAIREMENT (resend, contestation, clôture — mises à
        // epoch 0) : sans lui, le cron ressusciterait des tokens du mauvais type.
        signatures: {
          where: {
            signed: false,
            type: { not: 'it_cachet' },
            tokenExpiresAt: { gt: new Date(1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        notifications: {
          where: { type: 'reminder', status: 'sent' },
          orderBy: { sentAt: 'desc' },
        },
      },
    });

    const appUrl = await this.getAppUrl();
    let sentCount = 0;

    const TYPE_LABELS: Record<string, string> = {
      mise_disposition: 'mise à disposition',
      restitution: 'restitution',
      pv_cloture: "procès-verbal d'équipements non restitués",
    };

    for (const bon of pendingBons) {
      try {
        const reminderCount = bon.notifications.length;
        if (reminderCount >= maxReminders) continue;

        // Staggered schedule: reminder N+1 fires once the bon has been pending
        // for delays[N] days since the last status change
        const pendingDays = (Date.now() - bon.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (pendingDays < delays[reminderCount]) continue;

        let sig = bon.signatures[0];
        if (!sig) continue; // aucun document en attente (ex: restitution partielle déjà signée)

        // Régénérer plutôt que d'envoyer un lien inutilisable :
        // - token expiré (sinon le rappel serait silencieusement un lien mort) ;
        // - token PRÉSENTIEL (isInPerson saute la vérification du destinataire :
        //   il ne doit jamais partir par email — on émet un token distant).
        if (sig.isInPerson || sig.tokenExpiresAt.getTime() <= Date.now()) {
          const fresh = await this.regenerateSignatureToken(
            bon.id,
            sig.type as 'mise_disposition' | 'restitution' | 'pv_cloture',
          );
          sig = { ...sig, token: fresh.token } as typeof sig;
        }

        const filialeNom = bon.filiale?.displayName ?? '';
        const typeLabel = TYPE_LABELS[sig.type] ?? 'mise à disposition';

        const html = await this.templatesService.renderTemplate('reminder', {
          TYPE_LABEL: typeLabel,
          REFERENCE: escapeHtml(bon.reference),
          SIGNER_URL: `${appUrl}/signer/${sig.token}`,
          REMINDER_NUMBER: String(reminderCount + 1),
          MAX_REMINDERS: String(maxReminders),
          FILIALE_NOM: escapeHtml(filialeNom),
        });

        const subjectDoc = sig.type === 'pv_cloture' ? 'Procès-verbal' : `Bon de ${typeLabel}`;
        const ok = await this.sendEmail(
          bon.collaborateurEmail,
          `[RAPPEL] [${bon.reference}] ${subjectDoc} à signer — ${filialeNom}`,
          html,
        );
        if (ok) sentCount++;

        await this.prisma.notificationLog.create({
          data: {
            bonId: bon.id,
            recipientEmail: bon.collaborateurEmail,
            type: 'reminder',
            status: ok ? 'sent' : 'failed',
            reminderNumber: reminderCount + 1,
          },
        });
      } catch (err) {
        this.logger.error(`Erreur rappel bon ${bon.id} (${bon.reference}): ${err}`);
      }
    }

    this.logger.log(`Cron rappels terminé — ${pendingBons.length} bons éligibles, ${sentCount} rappels envoyés`);
  }
}
