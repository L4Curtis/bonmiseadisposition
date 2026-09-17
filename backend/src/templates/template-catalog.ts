export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel';
  recipient: string;
  /** Pastille affichée dans l'admin. Tous les emails partagent désormais
   *  l'en-tête de marque rouge Livio (cf. email-layout.brandHeader) — la pastille
   *  reflète donc cette couleur unique, pas une couleur par catégorie. */
  headerColor: string;
  variables: { name: string; description: string }[];
}

// Couleur de marque (= BRAND de email-layout) pour toutes les pastilles
const BRAND_PASTILLE = '#D8372B';

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
  DATE_RESTITUTION: 'Date de restitution prévue',
  PORTAIL_URL: 'Lien vers le portail collaborateur (mes bons)',
};

const vars = (...names: string[]) =>
  names.map((n) => ({ name: n, description: VARIABLE_DESCRIPTIONS[n] ?? n }));

/** Catalogue des templates d'email disponibles (métadonnées admin — le HTML
 *  par défaut de chacun vit dans ./defaults/*.ts). */
export const TEMPLATES: TemplateDefinition[] = [
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
  {
    id: 'confirmation_pv_cloture',
    name: 'Confirmation de signature — Procès-verbal de clôture',
    description: "Envoyé au collaborateur après signature du procès-verbal d'équipements non restitués",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('FILIALE_NOM', 'REFERENCE', 'TYPE_LABEL'),
  },
  {
    id: 'restitution_due_reminder',
    name: 'Rappel — Restitution prévue',
    description: "Envoyé automatiquement au collaborateur avant la date de restitution prévue d'un bon actif",
    category: 'rappel',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'DATE_RESTITUTION', 'EQUIP_LIST', 'PORTAIL_URL'),
  },
];

/** Templates dont le contenu doit obligatoirement porter un lien de signature.
 *  'reminder' inclus : le rappel de signature relaie lui aussi {{SIGNER_URL}}. */
export const SIGNER_URL_REQUIRED_TEMPLATES = ['mise_disposition_request', 'restitution_request', 'pv_cloture_request', 'reminder'];
export const MAX_TEMPLATE_HTML_LENGTH = 200_000;

// ─── Données de prévisualisation (admin) ─────────────────────────────────────

// Styled <li> items for preview (mirrors notification/messages/equipment-lists.ts output)
const PREVIEW_EQUIP_LIST = [
  'Lenovo ThinkBook 16 G6|(N° série : SN-LP-2026-001)',
  'Dell UltraSharp U2723QE|(N° série : SN-EC-2026-042)',
  'Logitech MX Master 3S|',
  'Jabra Evolve2 75|(N° série : SN-CA-2026-007)',
].map((s) => {
  const [label, serial] = s.split('|');
  return `<li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}${serial ? `<span style="color:#A79F94;font-size:12px;margin-left:6px">${serial}</span>` : ''}</li>`;
}).join('\n    ');

const PREVIEW_NOT_RETURNED_LIST = [
  'Lenovo ThinkBook 16 G6|(N° série : SN-LP-2026-001)|Volé',
  'Dell UltraSharp U2723QE|(N° série : SN-EC-2026-042)|Non restitué',
].map((s) => {
  const [label, serial, reason] = s.split('|');
  return `<li style="padding:8px 0;border-bottom:1px solid #fee2e2;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">${label}<span style="color:#A79F94;font-size:12px;margin-left:6px">${serial}</span><span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">${reason}</span></li>`;
}).join('\n    ');

export const PREVIEW_VARS: Record<string, string> = {
  COLLAB_CIVILITE: 'Monsieur',
  COLLAB_NAME: 'Jean Dupont',
  FILIALE_NOM: 'Groupe Livio — Filiale Demo',
  REFERENCE: 'BMD-2026-0042',
  DATE_MISE_DISPO: '15 mars 2026',
  SIGNER_URL: '#',
  EQUIP_LIST: PREVIEW_EQUIP_LIST,
  NOT_RETURNED_LIST: PREVIEW_NOT_RETURNED_LIST,
  REMAINING_SECTION: `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#A79F94;text-transform:uppercase;letter-spacing:0.08em">Éléments restants sur ce bon (2)</p>
      <div style="background-color:#F6F3EE;border:1px solid #E2DFD9;border-radius:10px;padding:0 20px;margin-bottom:28px">
        <ul style="margin:0;padding:4px 0;list-style:none"><li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">Logitech MX Master 3S</li>
        <li style="padding:8px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.5;list-style:none">Jabra Evolve2 75<span style="color:#A79F94;font-size:12px;margin-left:6px">(N° série : SN-CA-2026-007)</span></li></ul>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#6B665E;line-height:1.6;background:#F6F3EE;border:1px solid #E2DFD9;border-radius:8px;padding:10px 14px">Ces équipements ne font pas partie de cette restitution et restent attribués.</p>`,
  CONTESTATION_MESSAGE: "Je conteste ce bon car l'écran référencé n'est pas celui qui m'a été remis. Le modèle indiqué est un Dell U2723QE mais j'ai reçu un U2422H.",
  RESOLUTION_MESSAGE: 'Après vérification, le bon a été corrigé avec le numéro de série correct. Le matériel référencé correspond bien à celui remis.',
  TYPE_LABEL: 'mise à disposition',
  REMINDER_NUMBER: '2',
  MAX_REMINDERS: '3',
  USER_NAME: 'Jean Dupont',
  DATE_RESTITUTION: '20 avril 2026',
  PORTAIL_URL: '#',
};
