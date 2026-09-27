import { ctaButton } from './email-layout';
export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'signature' | 'contestation' | 'rappel' | 'depart';
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
  REFERENCE: 'Référence du bon (ex. BON-2026-0042)',
  DATE_MISE_DISPO: 'Date de mise à disposition',
  SIGNER_URL: 'Lien de signature',
  EQUIP_LIST: 'Liste des équipements (balises <li>)',
  NOT_RETURNED_LIST: 'Liste des équipements non restitués (balises <li>)',
  REMAINING_SECTION: 'Section HTML des équipements restants (restitution partielle, vide si complète)',
  USER_NAME: 'Nom du collaborateur contestant',
  CONTESTATION_MESSAGE: 'Message de contestation',
  RESOLUTION_MESSAGE: 'Message de l’équipe informatique au collaborateur',
  REJECTION_SENTENCE: 'Ce qui reste valable : le document qui reste à signer (et, si son lien a expiré, comment en demander un nouveau), ou le bon tel qu’il a été signé (ou établi)',
  SIGN_BUTTON: 'Bouton « Signer le document » (ou « Demander un nouveau lien » si le lien a expiré) quand un document attend encore la signature (vide sinon)',
  REPLACEMENT_SENTENCE: 'Ce qui va se passer : bon corrigé (avec sa référence) qui remplacera le bon contesté, ou, pour une restitution ou un PV, correction du bon puis nouvel envoi à signer',
  TYPE_LABEL: 'Type de document, sans « bon de » (mise à disposition / restitution / PV de non-restitution)',
  DOCUMENT_LABEL: 'Document concerné (bon de mise à disposition / bon de restitution / PV de non-restitution)',
  BON_URL: 'Lien direct vers la fiche du bon',
  CONTESTATIONS_URL: 'Lien vers la liste des contestations à traiter',
  REMINDER_NUMBER: 'Numéro du rappel en cours',
  MAX_REMINDERS: 'Nombre maximum de rappels configuré',
  DATE_RESTITUTION: 'Date de restitution prévue',
  PORTAIL_URL: 'Lien vers le portail du collaborateur (ses bons et ses équipements)',
  COUNT: 'Nombre de collaborateurs concernés',
  DEPART_LIST: 'Liste des collaborateurs concernés (balises <li>)',
  INVENTORY_URL: "Lien vers l'inventaire par collaborateur, filtré sur les comptes désactivés",
  REASON: 'Motif saisi par l’équipe informatique',
  ABANDONED_STEP: 'Ce que la clôture abandonne (« la restitution », « la restitution et le PV de non-restitution », « le bon »)',
  REPLACEMENT_REFERENCE: 'Référence du bon corrigé qui remplace le bon contesté',
  FOUND_LIST: 'Liste des équipements retrouvés (balises <li>)',
  REQUESTER_EMAIL: 'Adresse du compte qui demande un nouveau lien',
  EXPIRED_AT: 'Date d’expiration du lien (ex. 15 septembre 2026)',
  AFTER_DAYS: 'Délai de la relance, en jours ouvrés',
  OVERDUE_LEAD: 'Début de phrase selon le nombre (« Une contestation attend » / « 3 contestations attendent »)',
  OVERDUE_LIST: 'Liste des contestations en attente, avec un lien vers chaque bon (balises <li>)',
};

const vars = (...names: string[]) =>
  names.map((n) => ({ name: n, description: VARIABLE_DESCRIPTIONS[n] ?? n }));

/** Variables des confirmations de signature (R-036). */
const CONFIRMATION_VARS = vars(
  'COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'DOCUMENT_LABEL', 'TYPE_LABEL', 'EQUIP_LIST', 'PORTAIL_URL',
);

/** Emails d'information au collaborateur et alertes à l'équipe informatique
 *  (variables construites par notification/messages/system-notice-emails.ts,
 *  link-request-alert-message.ts et templates/contestation-overdue-alert.ts). */
const NOTICE_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'bon_cancelled',
    name: 'Bon annulé',
    description: 'Envoyé au collaborateur quand un bon qui lui avait été envoyé pour signature est annulé, avec le motif',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'REASON'),
  },
  {
    id: 'handover_without_signature',
    name: 'Remise constatée sans signature',
    description: 'Envoyé au collaborateur quand l’équipe informatique enregistre la remise sans sa signature : le bon est En cours',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'REASON', 'EQUIP_LIST', 'PORTAIL_URL'),
  },
  {
    id: 'closed_without_signature',
    name: 'Bon clôturé sans signature',
    description: 'Envoyé au collaborateur quand l’équipe informatique clôture le bon sans sa signature, avec le motif',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'REASON', 'ABANDONED_STEP', 'PORTAIL_URL'),
  },
  {
    id: 'bon_replaced',
    name: 'Bon remplacé',
    description: 'Envoyé au collaborateur quand il a signé le bon corrigé d’une contestation fondée : le bon contesté est clôturé',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'REPLACEMENT_REFERENCE', 'PORTAIL_URL'),
  },
  {
    id: 'equipment_found',
    name: 'Équipement retrouvé',
    description: 'Envoyé au collaborateur quand un équipement déclaré non restitué est retrouvé',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'FOUND_LIST'),
  },
  {
    id: 'link_request_alert',
    name: 'Alerte — Nouveau lien demandé',
    description: "Envoyé à l'équipe informatique quand un collaborateur ouvre un lien expiré et demande un nouveau lien (une fois par lien)",
    category: 'rappel',
    recipient: 'Équipe informatique',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_NAME', 'REQUESTER_EMAIL', 'DOCUMENT_LABEL', 'REFERENCE', 'FILIALE_NOM', 'EXPIRED_AT', 'BON_URL'),
  },
  {
    id: 'contestation_overdue_alert',
    name: 'Relance — Contestations à trancher',
    description: "Envoyé à l'équipe informatique quand des contestations attendent une décision depuis plus de 7 jours ouvrés",
    category: 'contestation',
    recipient: 'Équipe informatique',
    headerColor: BRAND_PASTILLE,
    variables: vars('COUNT', 'AFTER_DAYS', 'OVERDUE_LEAD', 'OVERDUE_LIST', 'CONTESTATIONS_URL'),
  },
];

/** Catalogue des templates d'email disponibles (métadonnées admin — le HTML
 *  par défaut de chacun vit dans ./defaults/*.ts). */
export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'mise_disposition_request',
    name: 'Bon de mise à disposition — À signer',
    description: 'Envoyé au collaborateur quand le bon lui est transmis pour signature (remise à signer)',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'DATE_MISE_DISPO', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST'),
  },
  {
    id: 'restitution_request',
    name: 'Bon de restitution — À signer',
    description: 'Envoyé au collaborateur quand la restitution lui est transmise pour signature (restitution à signer)',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'EQUIP_LIST', 'REMAINING_SECTION'),
  },
  {
    id: 'confirmation_mise_disposition',
    name: 'Confirmation de signature — Mise à disposition',
    description: "Envoyé au collaborateur après sa signature d'un bon de mise à disposition",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: CONFIRMATION_VARS,
  },
  {
    id: 'confirmation_restitution',
    name: 'Confirmation de signature — Restitution',
    description: "Envoyé au collaborateur après sa signature d'un bon de restitution",
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: CONFIRMATION_VARS,
  },
  {
    id: 'pv_cloture_request',
    name: 'PV de non-restitution — À signer',
    description: 'Envoyé au collaborateur pour signature du PV de non-restitution',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'SIGNER_URL', 'NOT_RETURNED_LIST'),
  },
  {
    id: 'contestation_alert',
    name: 'Alerte contestation',
    description: "Envoyé à l'équipe informatique (administrateurs et techniciens actifs) quand un collaborateur conteste un bon",
    category: 'contestation',
    recipient: 'Équipe informatique',
    headerColor: BRAND_PASTILLE,
    variables: vars('USER_NAME', 'REFERENCE', 'FILIALE_NOM', 'CONTESTATION_MESSAGE', 'BON_URL', 'CONTESTATIONS_URL'),
  },
  {
    id: 'contestation_resolved',
    name: 'Contestation fondée',
    description: 'Envoyé au collaborateur quand sa contestation est jugée fondée : un bon corrigé va lui être envoyé (remise), ou le document est corrigé puis renvoyé à signer (restitution, PV)',
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE', 'REPLACEMENT_SENTENCE'),
  },
  {
    id: 'contestation_rejected',
    name: 'Contestation non retenue',
    description: "Envoyé au collaborateur quand sa contestation n'est pas retenue, avec le lien pour signer si un document l'attend encore",
    category: 'contestation',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('REFERENCE', 'FILIALE_NOM', 'RESOLUTION_MESSAGE', 'REJECTION_SENTENCE', 'SIGN_BUTTON'),
  },
  {
    id: 'reminder',
    name: 'Rappel — Document à signer',
    description: 'Envoyé automatiquement au collaborateur quand un document attend sa signature (3 rappels au plus par document)',
    category: 'rappel',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('DOCUMENT_LABEL', 'TYPE_LABEL', 'REFERENCE', 'SIGNER_URL', 'REMINDER_NUMBER', 'MAX_REMINDERS', 'FILIALE_NOM'),
  },
  {
    id: 'confirmation_pv_cloture',
    name: 'Confirmation de signature — PV de non-restitution',
    description: 'Envoyé au collaborateur après sa signature du PV de non-restitution',
    category: 'signature',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: CONFIRMATION_VARS,
  },
  {
    id: 'departure_alert',
    name: 'Alerte — Départs avec matériel',
    description: "Envoyé à l'équipe informatique en fin de synchronisation de l'annuaire quand un compte désactivé détient encore des équipements",
    category: 'depart',
    recipient: 'Équipe informatique',
    headerColor: BRAND_PASTILLE,
    variables: vars('COUNT', 'DEPART_LIST', 'INVENTORY_URL'),
  },
  {
    id: 'restitution_due_reminder',
    name: 'Rappel — Restitution prévue',
    description: 'Envoyé automatiquement au collaborateur avant la date de restitution prévue d’un bon en cours',
    category: 'rappel',
    recipient: 'Collaborateur',
    headerColor: BRAND_PASTILLE,
    variables: vars('COLLAB_CIVILITE', 'COLLAB_NAME', 'FILIALE_NOM', 'REFERENCE', 'DATE_RESTITUTION', 'EQUIP_LIST', 'PORTAIL_URL'),
  },
  ...NOTICE_TEMPLATES,
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

const PREVIEW_OVERDUE_LIST = [
  'BON-2026-0042|Jean Dupont|15/09/2026 (10 j)|Personne ne l’a prise en charge|L’écran n’est pas celui qui m’a été remis.',
  'BON-2026-0045|Alice Martin|12/09/2026 (13 j)|Prise en charge par Théo Bernard|Le numéro de série du portable est faux.',
].map((s) => {
  const [ref, name, since, follow, message] = s.split('|');
  return `<li style="padding:12px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.6;list-style:none"><strong style="font-family:monospace">${ref}</strong> <strong style="color:#1B1A18">${name}</strong> &middot; contestée le ${since}<br><span style="font-size:13px">${follow}</span><br><em style="color:#6B665E;font-size:13px">&ldquo;${message}&rdquo;</em></li>`;
}).join('\n');

export const PREVIEW_VARS: Record<string, string> = {
  COLLAB_CIVILITE: 'Monsieur',
  COLLAB_NAME: 'Jean Dupont',
  FILIALE_NOM: 'Groupe Livio — Filiale Demo',
  REFERENCE: 'BON-2026-0042',
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
  DOCUMENT_LABEL: 'bon de mise à disposition',
  REPLACEMENT_SENTENCE: 'Le bon corrigé BON-2026-0043 va vous être envoyé pour signature : il remplacera le bon BON-2026-0042 dès que vous l’aurez signé.',
  REJECTION_SENTENCE: 'la restitution reste à signer.',
  SIGN_BUTTON: ctaButton('#', 'Signer le document'),
  BON_URL: '#',
  CONTESTATIONS_URL: '#',
  REMINDER_NUMBER: '2',
  MAX_REMINDERS: '3',
  USER_NAME: 'Jean Dupont',
  DATE_RESTITUTION: '20 avril 2026',
  PORTAIL_URL: '#',
  COUNT: '2',
  DEPART_LIST: [
    '<li style="padding:10px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.6;list-style:none"><strong style="color:#1B1A18">Jean Dupont</strong> &middot; Groupe Livio — Filiale Demo<br><span style="color:#6B665E;font-size:13px">3 équipements &middot; prêt le plus ancien depuis 214 jours</span></li>',
    '<li style="padding:10px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.6;list-style:none"><strong style="color:#1B1A18">Alice Martin</strong> &middot; Groupe Livio — Filiale Demo<br><span style="color:#6B665E;font-size:13px">1 équipement &middot; prêt le plus ancien depuis 42 jours</span></li>',
  ].join('\n'),
  INVENTORY_URL: '#',
  REASON: 'Le collaborateur a été reçu au guichet et a signé sur place.',
  ABANDONED_STEP: 'la restitution',
  REPLACEMENT_REFERENCE: 'BON-2026-0043',
  FOUND_LIST: PREVIEW_EQUIP_LIST,
  REQUESTER_EMAIL: 'jean.dupont@groupe-livio.fr',
  EXPIRED_AT: '15 septembre 2026',
  AFTER_DAYS: '7',
  OVERDUE_LEAD: '2 contestations attendent',
  OVERDUE_LIST: PREVIEW_OVERDUE_LIST,
};
