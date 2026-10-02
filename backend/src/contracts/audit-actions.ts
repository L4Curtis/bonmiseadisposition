/**
 * Catalogue des actions du journal d'audit (table `AuditLog`, colonne `action`).
 *
 * Partagé tel quel avec le front (`npm run sync-contracts`) : aucun import,
 * uniquement des types, des données constantes et une fonction pure, pour que
 * le serveur (export CSV) et l'écran affichent exactement les mêmes libellés
 * et les mêmes phrases.
 *
 * Chaque action porte un libellé court (pastille, filtre), un gabarit de
 * phrase, un domaine (regroupement des filtres) et un ton (couleur de la
 * pastille). Une action `legacy` n'est plus écrite par le code, mais
 * d'anciennes lignes la portent encore : elle reste lisible.
 *
 * Syntaxe des gabarits (appliquée par `fillAuditSentence`) :
 *  - `{acteur}` : nom (ou email) de la personne qui a agi ; « Le système »
 *    quand l'entrée n'a pas d'auteur ;
 *  - `{bon}` : référence du bon concerné (BON-AAAA-NNNN) ;
 *  - tout autre `{nom}` : clé de premier niveau de `details`, telle que le
 *    code l'écrit (ex. `{reason}`, `{rowCount}`) ;
 *  - `[…]` : segment facultatif, retiré en entier si l'une de ses variables
 *    est absente, nulle ou vide (ex. `[ (motif : {reason})]`) ; les segments
 *    ne s'imbriquent pas ;
 *  - une variable hors crochets absente est remplacée par « — » ;
 *  - un texte inséré perd ses espaces de bord et son point final.
 *
 * Règles d'écriture : une seule phrase au passé composé, sujet `{acteur}`,
 * terminée par un point, avec le vocabulaire de l'application ; jamais de
 * code brut (statut, type de document) ni de donnée secrète. Une clé que
 * l'anonymisation retire (`reason`, `filename`, `email`…) n'apparaît que dans
 * un segment facultatif.
 */

/** Ton visuel d'une action (pastille de l'écran du journal). */
export type AuditActionTone = 'action' | 'success' | 'warning' | 'failure' | 'technical';

/** Domaine métier, pour regrouper les filtres. */
export type AuditActionDomain =
  | 'auth'
  | 'user'
  | 'directory'
  | 'bon'
  | 'restitution'
  | 'signature'
  | 'contestation'
  | 'attachment'
  | 'document'
  | 'equipment'
  | 'filiale'
  | 'config'
  | 'template'
  | 'retention'
  | 'audit';

export interface AuditActionDefinition {
  /** Libellé court, affiché dans la pastille et le filtre (« Bon créé »). */
  readonly label: string;
  /** Gabarit de phrase lisible (voir fillAuditSentence). */
  readonly sentence: string;
  readonly domain: AuditActionDomain;
  readonly tone: AuditActionTone;
  /** Action qui n'est plus écrite, mais que d'anciennes entrées portent encore. */
  readonly legacy?: true;
}

export const AUDIT_ACTIONS = {
  // ─── Connexion ──────────────────────────────────────────────────────────────
  login_sso: { label: 'Connexion SSO', sentence: '{acteur} a ouvert une session par SSO.', domain: 'auth', tone: 'action' },
  login_local_success: { label: 'Connexion locale', sentence: '{acteur} a ouvert une session locale.', domain: 'auth', tone: 'success' },
  login_local_failed: {
    label: 'Connexion locale refusée',
    sentence: "{acteur} a tenté d'ouvrir une session locale, sans succès.",
    domain: 'auth', tone: 'failure',
  },
  login_local_locked: {
    label: 'Connexion sur compte verrouillé',
    sentence: "{acteur} a tenté d'ouvrir une session locale alors que le compte était verrouillé.",
    domain: 'auth', tone: 'failure',
  },
  logout: { label: 'Déconnexion', sentence: '{acteur} a fermé sa session.', domain: 'auth', tone: 'technical' },
  password_changed: { label: 'Mot de passe modifié', sentence: '{acteur} a changé son mot de passe.', domain: 'auth', tone: 'warning' },
  sso_role_sync: {
    label: 'Rôle SSO vérifié',
    sentence: "{acteur} a ouvert une session par SSO, rôle vérifié d'après ses groupes Entra ID[ (groupes reçus : {groupsCount})].",
    domain: 'auth', tone: 'technical',
  },

  // ─── Utilisateurs ───────────────────────────────────────────────────────────
  user_created_manually: {
    label: 'Compte manuel créé', sentence: '{acteur} a créé le compte manuel[ de {displayName}].', domain: 'user', tone: 'action',
  },
  user_updated_manually: { label: 'Compte manuel modifié', sentence: '{acteur} a modifié un compte manuel.', domain: 'user', tone: 'action' },
  user_role_changed: { label: 'Rôle modifié', sentence: '{acteur} a changé le rôle[ de {targetEmail}].', domain: 'user', tone: 'warning' },
  user_unlocked: { label: 'Compte déverrouillé', sentence: '{acteur} a déverrouillé le compte[ de {targetEmail}].', domain: 'user', tone: 'action' },
  user_deactivated: { label: 'Compte désactivé', sentence: '{acteur} a désactivé le compte[ de {displayName}].', domain: 'user', tone: 'warning' },
  user_reactivated: { label: 'Compte réactivé', sentence: '{acteur} a réactivé le compte[ de {displayName}].', domain: 'user', tone: 'action' },
  users_imported: {
    label: 'Utilisateurs importés',
    sentence: '{acteur} a importé des utilisateurs (créés : {created}, mis à jour : {updated}, ignorés : {skipped}, en erreur : {errorCount}).',
    domain: 'user', tone: 'action',
  },

  // ─── Annuaire ───────────────────────────────────────────────────────────────
  ldap_users_deactivated: {
    label: "Comptes de l'annuaire désactivés",
    sentence: "{acteur} a désactivé les comptes collaborateurs issus de l'annuaire (comptes désactivés : {count}).",
    domain: 'directory', tone: 'warning',
  },
  ldap_sync_aborted: {
    label: "Synchronisation de l'annuaire interrompue",
    sentence: "{acteur} a interrompu la synchronisation de l'annuaire, qui aurait désactivé {toDeactivate} comptes sur {total}.",
    domain: 'directory', tone: 'failure',
  },
  departure_notified: {
    label: 'Départ signalé',
    sentence: "{acteur} a alerté l'équipe informatique du départ d'un collaborateur qui détient encore des équipements (équipements : {equipmentCount}).",
    domain: 'directory', tone: 'warning',
  },

  // ─── Bons ───────────────────────────────────────────────────────────────────
  bon_created: {
    label: 'Bon créé',
    sentence: '{acteur} a créé le bon {bon}[ pour corriger le bon {correctedFrom}][ en remplacement du bon {replaces}].',
    domain: 'bon', tone: 'action',
  },
  bon_corrected: { label: 'Bon corrigé', sentence: '{acteur} a créé le bon {correctedTo} pour corriger le bon {bon}.', domain: 'bon', tone: 'action' },
  bon_replaced: { label: 'Bon remplacé', sentence: '{acteur} a clôturé le bon {bon}, remplacé par le bon {replacement}.', domain: 'bon', tone: 'action' },
  // `details.channel` : « lien envoyé par email » ou « lien de signature au
  // guichet » — une remise au guichet n'envoie aucun email.
  bon_sent: {
    label: 'Remise soumise à signature',
    sentence: '{acteur} a soumis la mise à disposition du bon {bon} à la signature du collaborateur[, {channel}].',
    domain: 'bon', tone: 'action',
  },
  bon_sent_without_serial: {
    label: 'Envoi sans numéro de série',
    sentence: '{acteur} a soumis le bon {bon} à la signature malgré des numéros de série manquants.',
    domain: 'bon', tone: 'warning',
  },
  bon_sent_with_serial_conflicts: {
    label: 'Envoi avec numéros de série en double',
    sentence: "{acteur} a soumis le bon {bon} à la signature malgré des numéros de série déjà présents sur d'autres bons.",
    domain: 'bon', tone: 'warning',
  },
  // `details.fieldsLabel` : champs du document changés, en toutes lettres.
  bon_updated: {
    label: 'Bon modifié',
    sentence: '{acteur} a modifié le bon {bon}[ ({fieldsLabel})].',
    domain: 'bon', tone: 'action',
  },
  bon_modified_after_send: {
    label: 'Bon modifié après envoi',
    sentence: '{acteur} a modifié le bon {bon} après son envoi[ ({fieldsLabel})], ce qui demande une nouvelle signature.',
    domain: 'bon', tone: 'warning',
  },
  // Clôture par la signature qui termine le bon (restitution complète, PV de
  // non-restitution) : sans auteur, « Le système a clôturé… ». `details.cause`.
  bon_closed: { label: 'Bon clôturé', sentence: '{acteur} a clôturé le bon {bon}[ ({cause})].', domain: 'bon', tone: 'success' },
  bon_cancelled: { label: 'Bon annulé', sentence: '{acteur} a annulé le bon {bon}[ (motif : {reason})].', domain: 'bon', tone: 'failure' },
  bon_handover_without_signature: {
    label: 'Remise sans signature',
    sentence: '{acteur} a remis les équipements du bon {bon} sans signature du collaborateur[ (motif : {reason})].',
    domain: 'bon', tone: 'warning',
  },
  bon_closed_without_signature: {
    label: 'Clôture sans signature',
    sentence: '{acteur} a clôturé le bon {bon} sans signature du collaborateur[ (motif : {reason})].',
    domain: 'bon', tone: 'warning',
  },
  bon_closed_unilateral: {
    label: 'Étape sans signature',
    sentence: '{acteur} a fait avancer le bon {bon} sans signature du collaborateur[ (motif : {reason})].',
    domain: 'bon', tone: 'warning', legacy: true,
  },
  bon_reopened_for_correction: {
    label: 'Bon rouvert pour correction',
    sentence: '{acteur} a rouvert le bon {bon} pour corriger le document contesté.',
    domain: 'bon', tone: 'warning',
  },
  // Lien de signature par email, depuis la fiche ou la liste : premier envoi
  // d'un document (ou de sa nouvelle version), puis renvoi du même document.
  // `details.documentName` : « la restitution »… Le nom `reminder_sent` est
  // historique : les rappels automatiques, eux, ne sont pas au journal.
  signature_link_sent: {
    label: 'Lien de signature envoyé',
    sentence: '{acteur} a envoyé par email le lien de signature[ de {documentName}] du bon {bon}.',
    domain: 'bon', tone: 'action',
  },
  reminder_sent: {
    label: 'Lien renvoyé',
    sentence: '{acteur} a renvoyé par email le lien de signature[ de {documentName}] du bon {bon}.',
    domain: 'bon', tone: 'action',
  },

  // ─── Restitution ────────────────────────────────────────────────────────────
  restitution_initiated: {
    label: 'Équipements marqués rendus',
    sentence: '{acteur} a marqué des équipements du bon {bon} comme rendus.',
    domain: 'restitution', tone: 'action',
  },
  return_marking_undone: {
    label: 'Marquage « rendu » annulé',
    sentence: "{acteur} a annulé le marquage « rendu » d'équipements du bon {bon}.",
    domain: 'restitution', tone: 'warning',
  },
  declare_not_returned: {
    label: 'Équipements non restitués',
    sentence: '{acteur} a déclaré des équipements du bon {bon} non restitués[ (motif : {reason})].',
    domain: 'restitution', tone: 'warning',
  },
  declare_not_returned_partial: {
    label: 'Non restitués (partiel)',
    sentence: '{acteur} a déclaré une partie des équipements du bon {bon} non restitués.',
    domain: 'restitution', tone: 'warning', legacy: true,
  },
  mark_found: { label: 'Équipement retrouvé', sentence: '{acteur} a déclaré retrouvés des équipements du bon {bon}.', domain: 'restitution', tone: 'success' },
  mark_found_partial: {
    label: 'Équipement retrouvé (partiel)',
    sentence: '{acteur} a déclaré retrouvée une partie des équipements du bon {bon}.',
    domain: 'restitution', tone: 'success', legacy: true,
  },
  pv_cloture_emitted: {
    label: 'PV de non-restitution émis',
    sentence: '{acteur} a émis le PV de non-restitution du bon {bon} (équipements non restitués : {notReturnedCount}).',
    domain: 'restitution', tone: 'warning',
  },

  // ─── Signatures ─────────────────────────────────────────────────────────────
  // L'auteur est le signataire : le collaborateur, même au guichet sur le
  // compte du technicien (`details.inPersonContext` : « au guichet, en
  // présence de … »), ou le mandataire qui signe pour lui (« au guichet,
  // pour le compte de … (mandataire) »).
  signed_mise_disposition: {
    label: 'Mise à disposition signée',
    sentence: '{acteur} a signé la mise à disposition du bon {bon}[, {inPersonContext}].',
    domain: 'signature', tone: 'success',
  },
  signed_restitution: {
    label: 'Restitution signée', sentence: '{acteur} a signé la restitution du bon {bon}[, {inPersonContext}].', domain: 'signature', tone: 'success',
  },
  signed_pv_cloture: {
    label: 'PV de non-restitution signé',
    sentence: '{acteur} a signé le PV de non-restitution du bon {bon}[, {inPersonContext}].',
    domain: 'signature', tone: 'success',
  },
  signed_it_cachet: { label: 'Signature IT', sentence: '{acteur} a apposé la signature IT sur le bon {bon}.', domain: 'signature', tone: 'action' },
  signature_link_requested: {
    label: 'Nouveau lien demandé',
    sentence: '{acteur} a demandé un nouveau lien de signature pour le bon {bon}.',
    domain: 'signature', tone: 'warning',
  },

  // ─── Contestations ──────────────────────────────────────────────────────────
  bon_contested: { label: 'Bon contesté', sentence: '{acteur} a contesté le bon {bon}.', domain: 'contestation', tone: 'warning' },
  contestation_resolved: {
    label: 'Contestation fondée', sentence: '{acteur} a jugé fondée la contestation du bon {bon}.', domain: 'contestation', tone: 'success',
  },
  contestation_rejected: {
    label: 'Contestation non retenue', sentence: "{acteur} n'a pas retenu la contestation du bon {bon}.", domain: 'contestation', tone: 'failure',
  },

  // ─── Pièces jointes ─────────────────────────────────────────────────────────
  attachment_uploaded: {
    label: 'Pièce jointe ajoutée', sentence: '{acteur} a ajouté une pièce jointe[ ({filename})] au bon {bon}.', domain: 'attachment', tone: 'action',
  },
  attachment_deleted: {
    label: 'Pièce jointe supprimée', sentence: '{acteur} a supprimé une pièce jointe[ ({filename})] du bon {bon}.', domain: 'attachment', tone: 'warning',
  },
  equipment_photo_uploaded: {
    label: "Photo d'équipement ajoutée",
    sentence: "{acteur} a ajouté une photo d'équipement au bon {bon}.",
    domain: 'attachment', tone: 'action', legacy: true,
  },
  equipment_photo_deleted: {
    label: "Photo d'équipement supprimée",
    sentence: "{acteur} a supprimé une photo d'équipement du bon {bon}.",
    domain: 'attachment', tone: 'warning', legacy: true,
  },

  // ─── Documents PDF ──────────────────────────────────────────────────────────
  pdf_snapshot_saved: {
    label: 'Document PDF enregistré', sentence: '{acteur} a enregistré le document PDF[ {filename}] du bon {bon}.', domain: 'document', tone: 'technical',
  },
  pdf_snapshot_failed: {
    label: 'Document PDF non produit', sentence: "{acteur} n'a pas pu produire un document PDF du bon {bon}.", domain: 'document', tone: 'failure',
  },

  // ─── Catalogue (articles et packs) ──────────────────────────────────────────
  catalog_item_created: {
    label: 'Article créé', sentence: "{acteur} a ajouté l'article {brand} {model} au catalogue.", domain: 'equipment', tone: 'action',
  },
  catalog_item_updated: { label: 'Article modifié', sentence: '{acteur} a modifié un article du catalogue.', domain: 'equipment', tone: 'action' },
  catalog_item_disabled: {
    label: 'Article désactivé', sentence: "{acteur} a désactivé l'article {brand} {model} du catalogue.", domain: 'equipment', tone: 'warning',
  },
  catalog_item_reactivated: {
    label: 'Article réactivé', sentence: "{acteur} a réactivé l'article {brand} {model} du catalogue.", domain: 'equipment', tone: 'action',
  },
  catalog_imported: {
    label: 'Catalogue importé',
    sentence: '{acteur} a importé des articles dans le catalogue (créés : {created}, mis à jour : {updated}, ignorés : {skipped}, en erreur : {errorCount}).',
    domain: 'equipment', tone: 'action',
  },
  pack_created: { label: 'Pack créé', sentence: '{acteur} a créé le pack « {name} ».', domain: 'equipment', tone: 'action' },
  pack_updated: { label: 'Pack modifié', sentence: '{acteur} a modifié un pack.', domain: 'equipment', tone: 'action' },
  pack_items_changed: { label: "Contenu d'un pack modifié", sentence: "{acteur} a modifié les articles d'un pack.", domain: 'equipment', tone: 'action' },
  pack_disabled: { label: 'Pack désactivé', sentence: '{acteur} a désactivé le pack « {name} ».', domain: 'equipment', tone: 'warning' },
  pack_reactivated: { label: 'Pack réactivé', sentence: '{acteur} a réactivé le pack « {name} ».', domain: 'equipment', tone: 'action' },

  // ─── Filiales ───────────────────────────────────────────────────────────────
  filiales_imported: {
    label: 'Filiales importées',
    sentence: '{acteur} a importé des filiales (créées : {created}, mises à jour : {updated}, ignorées : {skipped}, en erreur : {errorCount}).',
    domain: 'filiale', tone: 'action',
  },
  // Écrite à partir de la vague 3 (lot 3B/3C).
  filiale_created: { label: 'Filiale créée', sentence: '{acteur} a créé la filiale[ {name}].', domain: 'filiale', tone: 'action' },
  filiale_updated: { label: 'Filiale modifiée', sentence: '{acteur} a modifié la filiale[ {name}].', domain: 'filiale', tone: 'action' },
  filiale_deactivated: { label: 'Filiale désactivée', sentence: '{acteur} a désactivé la filiale[ {name}].', domain: 'filiale', tone: 'warning' },
  filiale_reactivated: { label: 'Filiale réactivée', sentence: '{acteur} a réactivé la filiale[ {name}].', domain: 'filiale', tone: 'action' },
  filiale_deleted: { label: 'Filiale supprimée', sentence: '{acteur} a supprimé la filiale[ {name}].', domain: 'filiale', tone: 'failure' },
  filiale_stamp_updated: {
    label: 'Cachet de filiale modifié', sentence: '{acteur} a remplacé le cachet de la filiale[ {name}].', domain: 'filiale', tone: 'warning',
  },
  filiale_logo_updated: {
    label: 'Logo de filiale modifié', sentence: '{acteur} a remplacé le logo de la filiale[ {name}].', domain: 'filiale', tone: 'action',
  },

  // ─── Paramètres ─────────────────────────────────────────────────────────────
  // Écrite à partir de la vague 3 (lot 3B/3C).
  // `details.section` : rubrique de l'écran ; `details.summary` : résumé des
  // changements, valeurs secrètes jamais écrites (« Mot de passe : modifié »).
  config_updated: {
    label: 'Paramètres modifiés',
    sentence: '{acteur} a modifié les paramètres[ « {section} »][ : {summary}].',
    domain: 'config', tone: 'warning',
  },

  // ─── Modèles (documents PDF et emails) ──────────────────────────────────────
  pdf_template_updated: {
    label: 'Modèle PDF modifié', sentence: '{acteur} a modifié un modèle de document PDF.', domain: 'template', tone: 'warning',
  },
  pdf_template_reset: {
    label: 'Modèle PDF réinitialisé', sentence: '{acteur} a rétabli un modèle de document PDF par défaut.', domain: 'template', tone: 'technical',
  },
  pdf_templates_imported: {
    label: 'Modèles PDF importés',
    sentence: '{acteur} a importé des modèles de document PDF (importés : {imported}, ignorés : {skipped}).',
    domain: 'template', tone: 'warning',
  },
  email_template_test_sent: {
    label: 'Email de test envoyé',
    sentence: "{acteur} a demandé l'envoi d'un email de test d'un modèle[ à {email}].",
    domain: 'template', tone: 'technical',
  },

  // ─── Conservation des données ───────────────────────────────────────────────
  retention_run: {
    label: 'Conservation appliquée',
    sentence:
      '{acteur} a appliqué la politique de conservation des données (bons anonymisés : {anonymized}, liens purgés : {purgedTokens}, pièces jointes supprimées : {purgedAttachments}).',
    domain: 'retention', tone: 'technical',
  },
  bon_anonymized: {
    label: 'Bon anonymisé', sentence: '{acteur} a anonymisé le bon {bon} au terme de sa durée de conservation.', domain: 'retention', tone: 'technical',
  },
  attachments_purged: {
    label: 'Pièces jointes anciennes supprimées',
    sentence: '{acteur} a supprimé les pièces jointes arrivées au terme de leur durée de conservation (fichiers : {count}).',
    domain: 'retention', tone: 'technical',
  },

  // ─── Journal d'audit ────────────────────────────────────────────────────────
  audit_exported: {
    label: "Journal d'audit exporté", sentence: "{acteur} a exporté le journal d'audit (lignes : {rowCount}).", domain: 'audit', tone: 'technical',
  },
} as const satisfies Readonly<Record<string, AuditActionDefinition>>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Libellés des domaines, en français. */
export const AUDIT_ACTION_DOMAINS: Readonly<Record<AuditActionDomain, string>> = {
  auth: 'Connexion',
  user: 'Utilisateurs',
  directory: 'Annuaire',
  bon: 'Bons',
  restitution: 'Restitution',
  signature: 'Signatures',
  contestation: 'Contestations',
  attachment: 'Pièces jointes',
  document: 'Documents PDF',
  equipment: 'Catalogue',
  filiale: 'Filiales',
  config: 'Paramètres',
  template: 'Modèles',
  retention: 'Conservation des données',
  audit: "Journal d'audit",
};

/** Valeurs d'un gabarit : `acteur`, `bon`, puis les clés de `details`. */
export interface AuditSentenceValues {
  readonly [placeholder: string]: string | number | null | undefined;
}

/** Auteur affiché quand une entrée n'a pas d'auteur (tâche planifiée…). */
export const AUDIT_SYSTEM_ACTOR = 'Le système';

/** Remplace une variable obligatoire absente. */
const MISSING_VALUE = '—';

/** Valeur insérée dans une phrase : un texte saisi qui finit par un point
 *  (« motif : Bon en double. ») le perd, la phrase a déjà sa ponctuation. */
function inlineValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : value.trim().replace(/\s*\.+$/, '');
}

function isBlank(value: string | number | null | undefined): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function readValue(values: AuditSentenceValues, name: string): string | number | null | undefined {
  // Propres clés seulement : `{constructor}` ne doit jamais lire le prototype.
  const own = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
  return name === 'acteur' && isBlank(own) ? AUDIT_SYSTEM_ACTOR : own;
}

/** Remplace les `{nom}` d'un morceau sans crochets ; `complete` est faux dès
 *  qu'une variable manque. */
function fillPlaceholders(text: string, values: AuditSentenceValues): { text: string; complete: boolean } {
  let out = '';
  let complete = true;
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('{', cursor);
    const close = open === -1 ? -1 : text.indexOf('}', open + 1);
    if (close === -1) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, open);
    const value = readValue(values, text.slice(open + 1, close));
    if (isBlank(value)) {
      complete = false;
      out += MISSING_VALUE;
    } else {
      out += inlineValue(value as string | number);
    }
    cursor = close + 1;
  }
  return { text: out, complete };
}

/**
 * Phrase lisible d'une entrée du journal, à partir du gabarit de son action
 * (voir la syntaxe en tête de fichier). Fonction pure, en temps linéaire.
 */
export function fillAuditSentence(template: string, values: AuditSentenceValues): string {
  let out = '';
  let cursor = 0;
  while (cursor < template.length) {
    const open = template.indexOf('[', cursor);
    const close = open === -1 ? -1 : template.indexOf(']', open + 1);
    if (close === -1) {
      out += fillPlaceholders(template.slice(cursor), values).text;
      break;
    }
    out += fillPlaceholders(template.slice(cursor, open), values).text;
    const segment = fillPlaceholders(template.slice(open + 1, close), values);
    if (segment.complete) out += segment.text;
    cursor = close + 1;
  }
  return out;
}
