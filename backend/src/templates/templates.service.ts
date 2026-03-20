import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel';
  recipient: string;
  headerColor: string;
  variables: { name: string; description: string }[];
}

export const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  COLLAB_CIVILITE: 'Civilité (Monsieur / Madame)',
  COLLAB_NAME: 'Nom complet du collaborateur',
  FILIALE_NOM: 'Nom de la filiale',
  REFERENCE: 'Référence du bon (ex: BMD-2026-0042)',
  DATE_MISE_DISPO: 'Date de mise à disposition',
  SIGNER_URL: 'Lien de signature',
  EQUIP_LIST: 'Liste des équipements (balises <li>)',
  NOT_RETURNED_LIST: 'Liste des équipements non restitués (balises <li>)',
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
    headerColor: '#1d4ed8',
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'DATE_MISE_DISPO', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST'),
  },
  {
    id: 'restitution_request',
    name: 'Bon de restitution — À signer',
    description: "Envoyé au collaborateur lors de la création d'un bon de restitution",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: '#7c3aed',
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST'),
  },
  {
    id: 'confirmation_mise_disposition',
    name: 'Confirmation de signature — Mise à disposition',
    description: "Envoyé au collaborateur après signature d'un bon de mise à disposition",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: '#16a34a',
    variables: vars('FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL'),
  },
  {
    id: 'confirmation_restitution',
    name: 'Confirmation de signature — Restitution',
    description: "Envoyé au collaborateur après signature d'un bon de restitution",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: '#7c3aed',
    variables: vars('FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL'),
  },
  {
    id: 'pv_cloture_request',
    name: "PV d'équipements non restitués — À signer",
    description: "Envoyé au collaborateur pour signature du procès-verbal",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: '#dc2626',
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'NOT_RETURNED_LIST'),
  },
  {
    id: 'contestation_alert',
    name: 'Alerte contestation',
    description: "Envoyé au staff IT lorsqu'un collaborateur conteste son bon",
    category: 'contestation',
    recipient: 'Staff IT',
    headerColor: '#b91c1c',
    variables: vars('USER_NAME', 'REFERENCE', 'FILIALE_NOM', 'CONTESTATION_MESSAGE'),
  },
  {
    id: 'contestation_resolved',
    name: 'Contestation prise en compte',
    description: 'Envoyé au collaborateur lorsque sa contestation est retenue',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: '#16a34a',
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE'),
  },
  {
    id: 'contestation_rejected',
    name: 'Contestation non retenue',
    description: 'Envoyé au collaborateur lorsque sa contestation est rejetée',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: '#dc2626',
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE'),
  },
  {
    id: 'reminder',
    name: 'Rappel — Document en attente de signature',
    description: "Envoyé automatiquement lorsqu'un bon est en attente depuis trop longtemps",
    category: 'rappel',
    recipient: 'Collaborateur',
    headerColor: '#ea580c',
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
  CONTESTATION_MESSAGE: "Je conteste ce bon car l'écran référencé n'est pas celui qui m'a été remis. Le modèle indiqué est un Dell U2723QE mais j'ai reçu un U2422H.",
  RESOLUTION_MESSAGE: 'Après vérification, le bon a été corrigé avec le numéro de série correct. Le matériel référencé correspond bien à celui remis.',
  TYPE_LABEL: 'mise à disposition',
  REMINDER_NUMBER: '2',
  MAX_REMINDERS: '3',
  USER_NAME: 'Jean Dupont',
};

// ─── Shared layout helpers ────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<div style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="padding:40px 16px 48px">
    ${content}
  </div>
</div>`;
}

function card(header: string, body: string, footer: string): string {
  return `<div style="max-width:600px;margin:0 auto">
  <div style="background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
    ${header}
    ${body}
    ${footer}
  </div>
  <p style="text-align:center;font-size:11px;color:#cbd5e1;margin:16px 0 0;letter-spacing:0.03em">© 2026 Groupe Livio &middot; Confidentiel</p>
</div>`;
}

function header(
  bgColor: string,
  bgColor2: string,
  textColor: string,
  label: string,
  title: string,
  subtitle: string,
): string {
  return `<div style="background-color:${bgColor};background-image:linear-gradient(135deg,${bgColor} 0%,${bgColor2} 100%);padding:36px 40px">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:0.09em">${label}</p>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;letter-spacing:-0.01em">${title}</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.72);font-weight:400">${subtitle}</p>
    </div>`;
}

function metaStrip(items: string[]): string {
  return `<div style="background-color:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 40px">
      <span style="font-size:12px;color:#64748b;font-weight:400">${items.join('&nbsp;&nbsp;<span style="color:#cbd5e1">&middot;</span>&nbsp;&nbsp;')}</span>
    </div>`;
}

function body(content: string): string {
  return `<div style="padding:36px 40px">${content}</div>`;
}

function footer(): string {
  return `<div style="border-top:1px solid #f1f5f9;padding:20px 40px 28px">
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">Service informatique — Groupe Livio<br>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
    </div>`;
}

function ctaButton(url: string, label: string, bgColor: string, bgColor2: string): string {
  return `<div style="text-align:center;margin:28px 0">
      <a href="${url}" target="_blank" style="display:inline-block;background-color:${bgColor};background-image:linear-gradient(135deg,${bgColor} 0%,${bgColor2} 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;box-shadow:0 2px 8px rgba(0,0,0,0.18)">${label} &rarr;</a>
    </div>`;
}

function infoBox(bgColor: string, borderColor: string, textColor: string, content: string): string {
  return `<div style="background-color:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:12px 16px;margin-top:0">
      <p style="margin:0;font-size:13px;color:${textColor};line-height:1.6">${content}</p>
    </div>`;
}

function equipList(items: string, bgColor = '#f8fafc', borderColor = '#e2e8f0'): string {
  return `<div style="background-color:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:0 20px;margin-bottom:28px">
      <ul style="margin:0;padding:4px 0;list-style:none">
        ${items}
      </ul>
    </div>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em">${text}</p>`;
}

function refBadge(reference: string): string {
  return `<code style="display:inline-block;font-size:12px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;padding:2px 8px;border-radius:5px;font-family:'Courier New',monospace;letter-spacing:0.02em">${reference}</code>`;
}

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
      header('#1e3a8a', '#2563eb', 'rgba(191,219,254,0.8)', 'Mise à disposition d\'équipements', '{{FILIALE_NOM}}', 'Document à signer électroniquement'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Remise le <strong style="color:#0f172a">{{DATE_MISE_DISPO}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Dans le cadre de votre activité au sein de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>, le service informatique met à votre disposition les équipements ci-dessous à compter du <strong style="color:#0f172a">{{DATE_MISE_DISPO}}</strong>.
      </p>
      ${sectionLabel('Équipements remis')}
      ${equipList('{{EQUIP_LIST}}')}
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.75">
        Veuillez prendre connaissance de cette liste et signer électroniquement le bon de mise à disposition pour confirmer la réception de votre matériel.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de mise à disposition', '#1e3a8a', '#2563eb')}
      ${infoBox('#eff6ff', '#bfdbfe', '#1e40af', '<strong>Lien valable 7 jours</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
      footer(),
    ));
  }

  // ─── 2. Restitution ──────────────────────────────────────────────────────────

  private defaultRestitution(): string {
    return emailWrapper(card(
      header('#5b21b6', '#7c3aed', 'rgba(221,214,254,0.8)', 'Bon de restitution', '{{FILIALE_NOM}}', 'Document à signer électroniquement'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong> vous invite à signer le bon de <strong style="color:#0f172a">restitution</strong> pour le matériel suivant. Ce document atteste la restitution des équipements listés ci-dessous.
      </p>
      ${sectionLabel('Équipements à restituer')}
      ${equipList('{{EQUIP_LIST}}')}
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.75">
        Après signature, ce bon sera archivé et vous en recevrez une confirmation par email.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le bon de restitution', '#5b21b6', '#7c3aed')}
      ${infoBox('#f5f3ff', '#ddd6fe', '#5b21b6', '<strong>Lien valable 7 jours</strong> &middot; Authentification Microsoft requise &middot; La signature électronique a valeur légale')}
      `),
      footer(),
    ));
  }

  // ─── 3. Confirmation mise à disposition ──────────────────────────────────────

  private defaultConfirmationMiseDisposition(): string {
    return emailWrapper(card(
      header('#166534', '#16a34a', 'rgba(187,247,208,0.8)', 'Signature confirmée', 'Bon signé avec succès', '{{FILIALE_NOM}}'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#0f172a">Mise à disposition</strong>'])}
      <div style="height:36px"></div>
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;width:56px;height:56px;background-color:#dcfce7;border-radius:50%;line-height:56px;font-size:28px">&#10003;</div>
      </div>
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
      header('#5b21b6', '#7c3aed', 'rgba(221,214,254,0.8)', 'Signature confirmée', 'Bon signé avec succès', '{{FILIALE_NOM}}'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Type : <strong style="color:#0f172a">Restitution</strong>'])}
      <div style="height:36px"></div>
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;width:56px;height:56px;background-color:#ede9fe;border-radius:50%;line-height:56px;font-size:28px">&#10003;</div>
      </div>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre bon de <strong style="color:#0f172a">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} a bien été <strong style="color:#5b21b6">signé électroniquement</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Ce document est désormais archivé dans notre système. Conservez cet email comme preuve de signature.
      </p>
      ${infoBox('#f5f3ff', '#ddd6fe', '#5b21b6', 'Document archivé de façon sécurisée &middot; Ce bon a valeur contractuelle &middot; Aucune action supplémentaire requise')}
      `),
      footer(),
    ));
  }

  // ─── 5. PV clôture ───────────────────────────────────────────────────────────

  private defaultPvCloture(): string {
    return emailWrapper(card(
      header('#991b1b', '#dc2626', 'rgba(254,202,202,0.8)', 'Procès-verbal', '{{FILIALE_NOM}}', 'Équipements non restitués — Document à signer'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 8px;font-size:16px;color:#0f172a;font-weight:500">{{COLLAB_CIVILITE}} {{COLLAB_NAME}},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.75">
        Le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong> a constaté que les équipements ci-dessous n'ont pas été restitués dans le cadre du bon <strong style="color:#0f172a">{{REFERENCE}}</strong>. Un procès-verbal a été établi et nécessite votre signature.
      </p>
      ${sectionLabel('Équipements non restitués')}
      ${equipList('{{NOT_RETURNED_LIST}}', '#fef2f2', '#fecaca')}
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.75">
        Veuillez signer ce procès-verbal électroniquement. En cas de désaccord, vous pourrez formuler une contestation depuis votre espace collaborateur.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le procès-verbal', '#991b1b', '#dc2626')}
      ${infoBox('#fef2f2', '#fecaca', '#991b1b', '<strong>Lien valable 7 jours</strong> &middot; Authentification Microsoft requise &middot; Contestation possible depuis votre espace')}
      `),
      footer(),
    ));
  }

  // ─── 6. Alerte contestation ───────────────────────────────────────────────────

  private defaultContestationAlert(): string {
    return emailWrapper(card(
      header('#7f1d1d', '#b91c1c', 'rgba(254,202,202,0.8)', 'Action requise', 'Contestation reçue', 'Un collaborateur conteste son bon'),
      body(`
      ${metaStrip(['Bon <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', '<strong style="color:#0f172a">{{FILIALE_NOM}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75">
        Le collaborateur <strong style="color:#0f172a">{{USER_NAME}}</strong> a soumis une contestation concernant le bon ${refBadge('{{REFERENCE}}')} de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>.
      </p>
      ${sectionLabel('Motif de la contestation')}
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;font-style:italic">&ldquo;{{CONTESTATION_MESSAGE}}&rdquo;</p>
      </div>
      <p style="margin:0 0 0;font-size:14px;color:#64748b;line-height:1.6;background:#f8fafc;border-radius:8px;padding:12px 16px">
        Connectez-vous &agrave; l&rsquo;application pour consulter le bon concern&eacute; et apporter une r&eacute;ponse au collaborateur.
      </p>
      `),
      footer(),
    ));
  }

  // ─── 7. Contestation retenue ─────────────────────────────────────────────────

  private defaultContestationResolved(): string {
    return emailWrapper(card(
      header('#166534', '#16a34a', 'rgba(187,247,208,0.8)', 'Réponse à votre contestation', 'Contestation prise en compte', '{{FILIALE_NOM}}'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>'])}
      <div style="height:36px"></div>
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-block;width:56px;height:56px;background-color:#dcfce7;border-radius:50%;line-height:56px;font-size:28px">&#10003;</div>
      </div>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été <strong style="color:#166534">examinée et prise en compte</strong> par le service informatique.
      </p>
      ${sectionLabel('Message du service IT')}
      <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:0">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">{{RESOLUTION_MESSAGE}}</p>
      </div>
      `),
      footer(),
    ));
  }

  // ─── 8. Contestation rejetée ─────────────────────────────────────────────────

  private defaultContestationRejected(): string {
    return emailWrapper(card(
      header('#991b1b', '#dc2626', 'rgba(254,202,202,0.8)', 'Réponse à votre contestation', 'Contestation non retenue', '{{FILIALE_NOM}}'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75;text-align:center">
        Votre contestation relative au bon ${refBadge('{{REFERENCE}}')} a été examinée par le service informatique. Après vérification, elle <strong style="color:#991b1b">n'a pas pu être retenue</strong>.
      </p>
      ${sectionLabel('Message du service IT')}
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:0">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">{{RESOLUTION_MESSAGE}}</p>
      </div>
      `),
      footer(),
    ));
  }

  // ─── 9. Rappel signature ─────────────────────────────────────────────────────

  private defaultReminder(): string {
    return emailWrapper(card(
      header('#c2410c', '#ea580c', 'rgba(254,215,170,0.8)', 'Rappel', 'Document en attente de votre signature', 'Action requise'),
      body(`
      ${metaStrip(['Réf. <strong style="color:#0f172a;font-family:monospace">{{REFERENCE}}</strong>', 'Rappel <strong style="color:#0f172a">{{REMINDER_NUMBER}}/{{MAX_REMINDERS}}</strong>'])}
      <div style="height:36px"></div>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.75">
        Ce message est un rappel automatique. Votre bon de <strong style="color:#0f172a">{{TYPE_LABEL}}</strong> portant la référence ${refBadge('{{REFERENCE}}')} est toujours en attente de votre signature.
      </p>
      <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.75">
        Merci de signer ce document dès que possible. Sans signature, le traitement de votre dossier ne pourra pas être finalisé par le service informatique de <strong style="color:#0f172a">{{FILIALE_NOM}}</strong>.
      </p>
      ${ctaButton('{{SIGNER_URL}}', 'Signer le document maintenant', '#c2410c', '#ea580c')}
      ${infoBox('#fff7ed', '#fed7aa', '#c2410c', 'Rappel {{REMINDER_NUMBER}}/{{MAX_REMINDERS}} &middot; <strong>Lien valable 7 jours</strong> &middot; Authentification Microsoft requise')}
      `),
      footer(),
    ));
  }
}
