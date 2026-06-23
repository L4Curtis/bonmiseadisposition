import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  ctaButton,
  infoBox,
  equipList,
  sectionLabel,
  refBadge,
  quoteBox,
  statusIcon,
} from './email-layout';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel';
  recipient: string;
  /** Pastille affichée dans l'admin. Tous les emails partagent désormais
   *  l'en-tête de marque indigo (cf. email-layout.brandHeader) — la pastille
   *  reflète donc cette couleur unique, pas une couleur par catégorie. */
  headerColor: string;
  variables: { name: string; description: string }[];
}

// Couleur de marque (= BRAND_FROM de email-layout) pour toutes les pastilles
const BRAND_PASTILLE = '#4f46e5';

export const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  COLLAB_CIVILITE: 'Civilité (Monsieur / Madame)',
  COLLAB_NAME: 'Nom complet du collaborateur',
  FILIALE_NOM: 'Nom de la filiale',
  REFERENCE: 'Référence du bon (ex: BMD-2026-0042)',
  DATE_MISE_DISPO: 'Date de mise à disposition',
  SIGNER_URL: 'Lien de signature',
  EQUIP_LIST: 'Liste des équipements (balises <li>)',
  NOT_RETURNED_LIST: 'Liste des équipements non restitués (balises <li>)',
  REMAINING_SECTION: 'Section HTML des équipements restants (restitution partielle, vide si complète)',
  USER_NAME: 'Nom du collaborateur contestant',
  CONTESTATION_MESSAGE: 'Message de contestation',
  RESOLUTION_MESSAGE: 'Message de résolution du service IT',
  TYPE_LABEL: 'Type de bon (mise à disposition / restitution)',
  REMINDER_NUMBER: 'Numéro du rappel en cours',
  MAX_REMINDERS: 'Nombre maximum de rappels configuré',
};

const vars = (...names: string[]) =>
  names.map((n) => ({ name: n, description: VARIABLE_DESCRIPTIONS[n] ?? n }));

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'mise_disposition_request',
    name: 'Bon de mise à disposition — À signer',
    description: "Envoyé au collaborateur lors de la création d'un bon de mise à disposition",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'DATE_MISE_DISPO', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST'),
  },
  {
    id: 'restitution_request',
    name: 'Bon de restitution — À signer',
    description: "Envoyé au collaborateur lors de la création d'un bon de restitution",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST', 'REMAINING_SECTION'),
  },
  {
    id: 'confirmation_mise_disposition',
    name: 'Confirmation de signature — Mise à disposition',
    description: "Envoyé au collaborateur après signature d'un bon de mise à disposition",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL'),
  },
  {
    id: 'confirmation_restitution',
    name: 'Confirmation de signature — Restitution',
    description: "Envoyé au collaborateur après signature d'un bon de restitution",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL'),
  },
  {
    id: 'pv_cloture_request',
    name: "PV d'équipements non restitués — À signer",
    description: "Envoyé au collaborateur pour signature du procès-verbal",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'NOT_RETURNED_LIST'),
  },
  {
    id: 'contestation_alert',
    name: 'Alerte contestation',
    description: "Envoyé au staff IT lorsqu'un collaborateur conteste son bon",
    category: 'contestation',
    recipient: 'Staff IT',
    headerColor: BRAND_PASTILLE,
    variables: vars('USER_NAME', 'REFERENCE', 'FILIALE_NOM', 'CONTESTATION_MESSAGE'),
  },
  {
    id: 'contestation_resolved',
    name: 'Contestation prise en compte',
    description: 'Envoyé au collaborateur lorsque sa contestation est retenue',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE'),
  },
  {
    id: 'contestation_rejected',
    name: 'Contestation non retenue',
    description: 'Envoyé au collaborateur lorsque sa contestation est rejetée',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE'),
  },
  {
    id: 'reminder',
    name: 'Rappel — Document en attente de signature',
    description: "Envoyé automatiquement lorsqu'un bon est en attente depuis trop longtemps",
    category: 'rappel',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('TYPE_LABEL', 'REFERENCE', 'SIGNER_URL', 'REMINDER_NUMBER', 'MAX_REMINDERS', 'FILIALE_NOM'),
  },
];

// Styled <li> items for preview (mirrors notification.service.ts buildEquipList output)
const PREVIEW_EQUIP_LIST = [
  'Lenovo ThinkBook 16 G6|(N° série : SN-LP-2026-001)',
  'Dell UltraSharp U2723QE|(N° série : SN-EC-2026-042)',
  'Logitech MX Master 3S|',
  'Jabra Evolve2 75|(N° série : SN-CA-2026-007)',
].map((s) => {
  const [label, serial] = s.split('|');
  return `<li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}${serial ? `<span style="color:#94a3b8;font-size:12px;margin-left:6px">${serial}</span>` : ''}</li>`;
}).join('\n    ');

const PREVIEW_NOT_RETURNED_LIST = [
  'Lenovo ThinkBook 16 G6|(N° série : SN-LP-2026-001)|Volé',
  'Dell UltraSharp U2723QE|(N° série : SN-EC-2026-042)|Non restitué',
].map((s) => {
  const [label, serial, reason] = s.split('|');
  return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#374151;line-height:1.5;list-style:none">${label}<span style="color:#94a3b8;font-size:12px;margin-left:6px">${serial}</span><span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${reason}</span></li>`;
}).join('\n    ');

const PREVIEW_VARS: Record<string, string> = {
  COLLAB_CIVILITE: 'Monsieur',
  COLLAB_NAME: 'Jean Dupont',
  FILIALE_NOM: 'Groupe Livio — Filiale Demo',
  REFERENCE: 'BMD-2026-0042',
  DATE_MISE_DISPO: '15 mars 2026',
  SIGNER_URL: '#',
  EQUIP_LIST: PREVIEW_EQUIP_LIST,
  NOT_RETURNED_LIST: PREVIEW_NOT_RETURNED_LIST,
  REMAINING_SECTION: `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em">Éléments restants sur ce bon (2)</p>
      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none"><li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">Logitech MX Master 3S</li>
        <li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.5;list-style:none">Jabra Evolve2 75<span style="color:#94a3b8;font-size:12px;margin-left:6px">(N° série : SN-CA-2026-007)</span></li></ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#64748b;line-height:1.6;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px">Ces équipements ne font pas partie de cette restitution et restent attribués.</p>`,
  CONTESTATION_MESSAGE: "Je conteste ce bon car l'écran référencé n'est pas celui qui m'a été remis. Le modèle indiqué est un Dell U2723QE mais j'ai reçu un U2422H.",
  RESOLUTION_MESSAGE: 'Après vérification, le bon a été corrigé avec le numéro de série correct. Le matériel référencé correspond bien à celui remis.',
  TYPE_LABEL: 'mise à disposition',
  REMINDER_NUMBER: '2',
  MAX_REMINDERS: '3',
  USER_NAME: 'Jean Dupont',
};

// ─── Layout : voir ./email-layout.ts (partagé avec notification.service) ─────

// Chips de statut affichés dans l'en-tête de marque (fond semi-transparent
// par-dessus le dégradé indigo)
const CHIP_ACTION = { text: 'À signer', bg: 'rgba(255,255,255,0.16)' };
const CHIP_SUCCESS = { text: 'Signé', bg: 'rgba(16,185,129,0.40)' };
const CHIP_DANGER = (text: string) => ({ text, bg: 'rgba(239,68,68,0.45)' });
const CHIP_WARNING = (text: string) => ({ text, bg: 'rgba(245,158,11,0.45)' });

@Injectable()
export class TemplatesService {
  constructor(
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Catalogue ───────────────────────────────────────────────────────────────

  async getAll(): Promise<(TemplateDefinition & { isCustomized: boolean })[]> {
    const customized = await this.configService.getAll('email_templates');
    return TEMPLATES.map((t) => ({ ...t, isCustomized: !!customized[t.id] }));
  }

  getTemplateById(id: string): TemplateDefinition {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new NotFoundException(`Template "${id}" introuvable`);
    return tpl;
  }

  // ─── HTML retrieval ──────────────────────────────────────────────────────────

  getDefaultHtml(id: string): string {
    this.getTemplateById(id);
    return this.buildDefaultHtml(id);
  }

  async getTemplateHtml(id: string): Promise<string> {
    this.getTemplateById(id);
    const custom = await this.configService.get('email_templates', id);
    return custom ?? this.buildDefaultHtml(id);
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  render(html: string, vars: Record<string, string>): string {
    return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  async renderTemplate(id: string, vars: Record<string, string>): Promise<string> {
    const html = await this.getTemplateHtml(id);
    return this.render(html, vars);
  }

  async getPreviewHtml(id: string): Promise<string> {
    this.getTemplateById(id);
    const html = await this.getTemplateHtml(id);
    return this.render(html, PREVIEW_VARS);
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async updateTemplate(id: string, html: string, updatedById?: string): Promise<void> {
    this.getTemplateById(id);
    await this.configService.set('email_templates', id, html, { updatedById });
  }

  async resetTemplate(id: string): Promise<void> {
    this.getTemplateById(id);
    await this.prisma.appConfig.deleteMany({ where: { category: 'email_templates', key: id } });
    this.configService.invalidateCache('email_templates', id);
  }

  // ─── Export / Import ─────────────────────────────────────────────────────────

  async exportAll() {
    const customized = await this.configService.getAll('email_templates');
    const templates = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      html: (customized[t.id] ?? null) || this.buildDefaultHtml(t.id),
      isCustomized: !!customized[t.id],
    }));
    return { exportedAt: new Date().toISOString(), templates };
  }

  async importAll(
    data: { templates: { id: string; html: string }[] },
    updatedById?: string,
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const item of data.templates) {
      if (!TEMPLATES.find((t) => t.id === item.id)) { skipped++; continue; }
      await this.configService.set('email_templates', item.id, item.html, { updatedById });
      imported++;
    }
    return { imported, skipped };
  }

  // ─── Default HTML templates ──────────────────────────────────────────────────

  private buildDefaultHtml(id: string): string {
    switch (id) {
      case 'mise_disposition_request':      return this.defaultMiseDisposition();
      case 'restitution_request':           return this.defaultRestitution();
      case 'confirmation_mise_disposition': return this.defaultConfirmationMiseDisposition();
      case 'confirmation_restitution':      return this.defaultConfirmationRestitution();
      case 'pv_cloture_request':            return this.defaultPvCloture();
      case 'contestation_alert':            return this.defaultContestationAlert();
      case 'contestation_resolved':         return this.defaultContestationResolved();
      case 'contestation_rejected':         return this.defaultContestationRejected();
      case 'reminder':                      return this.defaultReminder();
      default: throw new NotFoundException(`Template "${id}" introuvable`);
    }
  }

  // ─── 1. Mise à disposition ───────────────────────────────────────────────────

  private defaultMiseDisposition(): string {
    return emailWrapper(card(
      brandHeader('Équipements mis à votre disposition', '{{FILIALE_NOM}}', CHIP_ACTION),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Remise le <strong style="color:#0f172a">{{DATE_MISE_DISPO}}</strong>']),
      body(`
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Dans le cadre de votre activité au sein de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>, le service informatique met à votre disposition les équipements ci-dessous à compter du <strong style="color:#0f172a">{{DATE_MISE_DISPO}}</strong>.
      </p>
      ${sectionLabel('Équipements remis')}
      ${equipList('{{EQUIP_LIST}}')}
      <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.75">
        Veuillez prendre connaissance de cette liste et signer électroniquement le bon de mise à disposition pour confirmer la réception de votre matériel.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de mise à disposition')}
      ${infoBox('#eef2ff', '#c7d2fe', '#4338ca', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
      footer(),
    ));
  }

  // ─── 2. Restitution ──────────────────────────────────────────────────────────

  private defaultRestitution(): string {
    return emailWrapper(card(
      brandHeader('Restitution de matériel', '{{FILIALE_NOM}}', CHIP_ACTION),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>']),
      body(`
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong> vous invite à signer le bon de <strong style="color:#0f172a">restitution</strong> pour le matériel suivant. Ce document atteste la restitution des équipements listés ci-dessous.
      </p>
      ${sectionLabel('Équipements restitués')}
      ${equipList('{{EQUIP_LIST}}')}
      {{REMAINING_SECTION}}
      <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.75">
        Après signature, vous en recevrez une confirmation par email.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de restitution')}
      ${infoBox('#eef2ff', '#c7d2fe', '#4338ca', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
      footer(),
    ));
  }

  // ─── 3. Confirmation mise à disposition ──────────────────────────────────────

  private defaultConfirmationMiseDisposition(): string {
    return emailWrapper(card(
      brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#0f172a">Mise à disposition</strong>']),
      body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre bon de <strong style="color:#0f172a">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#166534">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', 'Document archivé de façon sécurisée &middot; Ce bon a valeur contractuelle &middot; Aucune action supplémentaire requise')}
      `),
      footer(),
    ));
  }

  // ─── 4. Confirmation restitution ─────────────────────────────────────────────

  private defaultConfirmationRestitution(): string {
    return emailWrapper(card(
      brandHeader('Signature confirmée', '{{FILIALE_NOM}}', CHIP_SUCCESS),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#0f172a">Restitution</strong>']),
      body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre bon de <strong style="color:#0f172a">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#166534">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f0fdf4', '#bbf7d0', '#166534', 'Document archivé de façon sécurisée &middot; Ce bon a valeur contractuelle &middot; Aucune action supplémentaire requise')}
      `),
      footer(),
    ));
  }

  // ─── 5. PV clôture ───────────────────────────────────────────────────────────

  private defaultPvCloture(): string {
    return emailWrapper(card(
      brandHeader('Procès-verbal d\'équipements non restitués', '{{FILIALE_NOM}}', CHIP_DANGER('Action requise')),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>']),
      body(`
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong> a constaté que les équipements ci-dessous n'ont pas été restitués dans le cadre du bon <strong style="color:#0f172a">{{REFERENCE}}</strong>. Un procès-verbal a été établi et nécessite votre signature.
      </p>
      ${sectionLabel('Équipements non restitués')}
      ${equipList('{{NOT_RETURNED_LIST}}', '#fef2f2', '#fecaca')}
      <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.75">
        Veuillez signer ce procès-verbal électroniquement. En cas de désaccord, vous pourrez formuler une contestation depuis votre espace collaborateur.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le procès-verbal')}
      ${infoBox('#fef2f2', '#fecaca', '#991b1b', '<strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise &middot; Contestation possible depuis votre espace')}
      `),
      footer(),
    ));
  }

  // ─── 6. Alerte contestation ───────────────────────────────────────────────────

  private defaultContestationAlert(): string {
    return emailWrapper(card(
      brandHeader('Contestation reçue', 'Un collaborateur conteste son bon', CHIP_DANGER('Action requise')),
      metaStrip(['Bon <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', '<strong style="color:#0f172a">{{FILIALE_NOM}}</strong>']),
      body(`
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75">
        Le collaborateur <strong style="color:#0f172a">{{USER_NAME}}</strong> a soumis une contestation concernant le bon ${refBadge('{{REFERENCE}}')} de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>.
      </p>
      ${sectionLabel('Motif de la contestation')}
      ${quoteBox('#dc2626', '#fef2f2', '#fecaca', '<em>&ldquo;{{CONTESTATION_MESSAGE}}&rdquo;</em>')}
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;background:#f8fafc;border-radius:10px;padding:12px 16px">
        Connectez-vous &agrave; l&rsquo;application pour consulter le bon concern&eacute; et apporter une r&eacute;ponse au collaborateur.
      </p>
      `),
      footer(),
    ));
  }

  // ─── 7. Contestation retenue ─────────────────────────────────────────────────

  private defaultContestationResolved(): string {
    return emailWrapper(card(
      brandHeader('Contestation prise en compte', '{{FILIALE_NOM}}', { text: 'Acceptée', bg: 'rgba(16,185,129,0.40)' }),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>']),
      body(`
      ${statusIcon('&#10003;', '#dcfce7')}
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été <strong style="color:#166534">examinée et prise en compte</strong> par le service informatique.
      </p>
      ${sectionLabel('Message du service IT')}
      ${quoteBox('#16a34a', '#f0fdf4', '#bbf7d0', '{{RESOLUTION_MESSAGE}}')}
      `),
      footer(),
    ));
  }

  // ─── 8. Contestation rejetée ─────────────────────────────────────────────────

  private defaultContestationRejected(): string {
    return emailWrapper(card(
      brandHeader('Contestation non retenue', '{{FILIALE_NOM}}', CHIP_DANGER('Non retenue')),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>']),
      body(`
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été examinée par le service informatique. Après vérification, elle <strong style="color:#991b1b">n'a pas pu être retenue</strong>.
      </p>
      ${sectionLabel('Message du service IT')}
      ${quoteBox('#dc2626', '#fef2f2', '#fecaca', '{{RESOLUTION_MESSAGE}}')}
      `),
      footer(),
    ));
  }

  // ─── 9. Rappel signature ─────────────────────────────────────────────────────

  private defaultReminder(): string {
    return emailWrapper(card(
      brandHeader('Document en attente de votre signature', '{{FILIALE_NOM}}', CHIP_WARNING('Rappel {{REMINDER_NUMBER}}/{{MAX_REMINDERS}}')),
      metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Rappel <strong style="color:#0f172a">{{REMINDER_NUMBER}}/{{MAX_REMINDERS}}</strong>']),
      body(`
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75">
        Ce message est un rappel automatique. Votre bon de <strong style="color:#0f172a">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} est toujours en attente de votre signature.
      </p>
      <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.75">
        Merci de signer ce document dès que possible. Sans signature, le traitement de votre dossier ne pourra pas être finalisé par le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le document maintenant')}
      ${infoBox('#fff7ed', '#fed7aa', '#c2410c', 'Rappel {{REMINDER_NUMBER}}/{{MAX_REMINDERS}} &middot; <strong>Lien à durée limitée</strong> &middot; Authentification Microsoft requise')}
      `),
      footer(),
    ));
  }
}
