// ─── Action label mapping ─────────────────────────────────────────────────────

const BLUE = 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400';
const GREEN = 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400';
const RED = 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400';
const YELLOW = 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400';
const ORANGE = 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400';
const AMBER = 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400';
const PURPLE = 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400';
const INDIGO = 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400';
const CYAN = 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400';
const SLATE = 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400';
const MUTED = 'bg-muted text-muted-foreground';

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login_sso:                   { label: 'Connexion SSO',            color: BLUE },
  login_local_success:         { label: 'Connexion locale',         color: GREEN },
  login_local_failed:          { label: 'Tentative échouée',        color: RED },
  logout:                      { label: 'Déconnexion',              color: MUTED },
  password_changed:            { label: 'Mot de passe modifié',     color: YELLOW },
  // Bons — cycle de vie
  bon_created:                 { label: 'Bon créé',                 color: BLUE },
  bon_sent:                    { label: 'Bon envoyé',               color: INDIGO },
  bon_cancelled:               { label: 'Bon annulé',               color: RED },
  bon_closed_unilateral:       { label: 'Clôture unilatérale',      color: ORANGE },
  bon_corrected:               { label: 'Bon corrigé',              color: BLUE },
  bon_anonymized:              { label: 'Anonymisé (RGPD)',         color: SLATE },
  restitution_initiated:       { label: 'Restitution initiée',      color: PURPLE },
  declare_not_returned:        { label: 'Matériel non rendu',       color: ORANGE },
  declare_not_returned_partial:{ label: 'Non rendu (partiel)',      color: ORANGE },
  mark_found:                  { label: 'Matériel retrouvé',        color: GREEN },
  reminder_sent:               { label: 'Rappel envoyé',            color: ORANGE },
  pdf_snapshot_saved:          { label: 'Document PDF généré',      color: SLATE },
  // Signatures
  signed_mise_disposition:     { label: 'Signé — Mise à dispo',     color: GREEN },
  signed_restitution:          { label: 'Signé — Restitution',      color: GREEN },
  signed_pv_cloture:           { label: 'Signé — PV clôture',       color: GREEN },
  signed_it_cachet:            { label: 'Cachet IT',                color: SLATE },
  // Pièces jointes
  attachment_uploaded:         { label: 'Pièce jointe ajoutée',     color: CYAN },
  attachment_deleted:          { label: 'Pièce jointe supprimée',   color: RED },
  // Contestations
  bon_contested:               { label: 'Contestation créée',       color: AMBER },
  contestation_resolved:       { label: 'Contestation acceptée',    color: GREEN },
  contestation_rejected:       { label: 'Contestation refusée',     color: RED },
  // Admin
  config_updated:              { label: 'Config modifiée',          color: YELLOW },
  ldap_sync:                   { label: 'Sync LDAP',                color: CYAN },
  pdf_template_updated:        { label: 'Modèle PDF modifié',       color: YELLOW },
  pdf_template_reset:          { label: 'Modèle PDF réinitialisé',  color: MUTED },
  pdf_templates_imported:      { label: 'Modèles PDF importés',     color: YELLOW },
};

export function actionMeta(action: string): { label: string; color: string } {
  return ACTION_LABELS[action] ?? { label: action, color: MUTED };
}
