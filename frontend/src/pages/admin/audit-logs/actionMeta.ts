// ─── Action label mapping ─────────────────────────────────────────────────────

// Jetons du thème plutôt qu'une teinte par action : dix couleurs décoratives
// ne se lisaient pas mieux qu'un code à quatre tons, et elles ignoraient le
// rouge de l'application. Sens : action courante, réussite, vigilance, échec,
// technique.
const ACTION = 'bg-primary/10 text-primary';
const REUSSITE = 'bg-success/10 text-success';
const VIGILANCE = 'bg-warning/10 text-warning';
const ECHEC = 'bg-destructive/10 text-destructive';
const MUTED = 'bg-muted text-muted-foreground';

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login_sso:                   { label: 'Connexion SSO',            color: ACTION },
  login_local_success:         { label: 'Connexion locale',         color: REUSSITE },
  login_local_failed:          { label: 'Tentative échouée',        color: ECHEC },
  logout:                      { label: 'Déconnexion',              color: MUTED },
  password_changed:            { label: 'Mot de passe modifié',     color: VIGILANCE },
  // Bons — cycle de vie
  bon_created:                 { label: 'Bon créé',                 color: ACTION },
  bon_sent:                    { label: 'Bon envoyé',               color: ACTION },
  bon_cancelled:               { label: 'Bon annulé',               color: ECHEC },
  bon_closed_unilateral:       { label: 'Clôture unilatérale',      color: VIGILANCE },
  bon_corrected:               { label: 'Bon corrigé',              color: ACTION },
  bon_anonymized:              { label: 'Anonymisé (RGPD)',         color: MUTED },
  restitution_initiated:       { label: 'Restitution initiée',      color: ACTION },
  declare_not_returned:        { label: 'Matériel non rendu',       color: VIGILANCE },
  declare_not_returned_partial:{ label: 'Non rendu (partiel)',      color: VIGILANCE },
  mark_found:                  { label: 'Matériel retrouvé',        color: REUSSITE },
  reminder_sent:               { label: 'Rappel envoyé',            color: VIGILANCE },
  pdf_snapshot_saved:          { label: 'Document PDF généré',      color: MUTED },
  // Signatures
  signed_mise_disposition:     { label: 'Signé — Mise à dispo',     color: REUSSITE },
  signed_restitution:          { label: 'Signé — Restitution',      color: REUSSITE },
  signed_pv_cloture:           { label: 'Signé — PV clôture',       color: REUSSITE },
  signed_it_cachet:            { label: 'Cachet IT',                color: MUTED },
  // Pièces jointes
  attachment_uploaded:         { label: 'Pièce jointe ajoutée',     color: ACTION },
  attachment_deleted:          { label: 'Pièce jointe supprimée',   color: ECHEC },
  // Contestations
  bon_contested:               { label: 'Contestation créée',       color: VIGILANCE },
  contestation_resolved:       { label: 'Contestation acceptée',    color: REUSSITE },
  contestation_rejected:       { label: 'Contestation refusée',     color: ECHEC },
  // Admin
  config_updated:              { label: 'Config modifiée',          color: VIGILANCE },
  ldap_sync:                   { label: 'Sync LDAP',                color: ACTION },
  pdf_template_updated:        { label: 'Modèle PDF modifié',       color: VIGILANCE },
  pdf_template_reset:          { label: 'Modèle PDF réinitialisé',  color: MUTED },
  pdf_templates_imported:      { label: 'Modèles PDF importés',     color: VIGILANCE },
  users_imported:              { label: 'Collaborateurs importés',  color: VIGILANCE },
  audit_exported:              { label: "Journal d'audit exporté", color: MUTED },
};

export function actionMeta(action: string): { label: string; color: string } {
  return ACTION_LABELS[action] ?? { label: action, color: MUTED };
}
