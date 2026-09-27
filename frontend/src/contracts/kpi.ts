// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/kpi.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — tableau de bord (`backend/src/kpi/`).
 *
 * `GET /kpi/aujourdhui` (admin, technician) : accueil IT, états du jour, sans
 * paramètre ni cache. `GET /kpi/parc|delais|incidents` (admin, technician,
 * direction) : acceptent `from`/`to` (AAAA-MM-JJ, 30 derniers jours par
 * défaut) et `filialeId` ; une période invalide est refusée en 400 ; réponses
 * mises en cache 60 s. Chaque indicateur est soit un **état du jour** (à la
 * date `asOf`, non filtré par la période), soit un **flux sur la période**
 * (comparé à la période précédente) : voir « Définition des indicateurs »
 * dans docs/architecture.md.
 */

import type { BonStatus, EquipmentCategory, IsoDateTime, SignatureType } from './common';
import type { ParcCategoryCount, ParcFilialeCount, ParcSituationCount } from './inventory';

// ─── Briques communes aux trois routes ────────────────────────────────────────

/** Date civile « AAAA-MM-JJ » (Europe/Paris) — et non une date-heure ISO :
 *  bornes de période, début de bucket, date de restitution prévue. */
export type KpiDate = string;

/** Granularité des séries, déduite de la durée : jour ≤ 31 j,
 *  semaine ≤ 182 j (buckets alignés sur le lundi), sinon mois (alignés sur le 1er). */
export type KpiGranularity = 'day' | 'week' | 'month';

/** Période courante résolue. */
export interface KpiPeriodInfo {
  from: KpiDate;
  to: KpiDate;
  granularity: KpiGranularity;
  /** Nombre de jours, bornes incluses. */
  days: number;
}

/** Période de comparaison : même durée, se terminant la veille de `from`. */
export interface KpiPreviousInfo {
  from: KpiDate;
  to: KpiDate;
}

/** Enveloppe commune aux trois réponses KPI. */
export interface KpiEnvelope {
  /** Instant du calcul : date des états du jour (« au 25/09 »). */
  asOf: IsoDateTime;
  period: KpiPeriodInfo;
  previous: KpiPreviousInfo;
  /** Filtre filiale appliqué, `null` sans filtre. */
  filialeId: string | null;
}

/** Compteur d'un flux sur la période courante et sur la précédente. Les deux
 *  valeurs sont toujours des nombres (0 à défaut de données). */
export interface KpiCompared {
  current: number;
  previous: number;
}

/** Ratio ou moyenne comparés : `null` quand le dénominateur est nul ou qu'il
 *  n'y a aucune donnée. */
export interface KpiRatioCompared {
  current: number | null;
  previous: number | null;
}

/** Point d'une série à une seule mesure. Un point par bucket de la période,
 *  à 0 si vide. */
export interface KpiSeriesPoint {
  bucket: KpiDate;
  count: number;
}

// ─── GET /api/kpi/parc ────────────────────────────────────────────────────────

/** Top 10 des modèles de catalogue les plus prêtés. */
export interface KpiParcTopModel {
  catalogItemId: string;
  /** « marque modèle ». */
  label: string;
  category: EquipmentCategory;
  count: number;
}

/** Parc en circulation (état instantané, sauf `series`). */
export interface KpiParcLoaned {
  /** Équipements en circulation ; égal à `/reporting/inventory/summary.total`
   *  sans filtre filiale. */
  total: number;
  /** Bons distincts concernés. */
  bons: number;
  byCategory: ParcCategoryCount[];
  byFiliale: ParcFilialeCount[];
  /** Toujours trois éléments ; somme égale à `total`. */
  bySituation: ParcSituationCount[];
  topModels: KpiParcTopModel[];
  /** Part hors catalogue (0 à 1), `null` si le parc est vide. */
  offCatalogShare: number | null;
  /** Part avec numéro de série renseigné (0 à 1), `null` si le parc est vide. */
  serialCoverage: number | null;
  /** Équipements chez les collaborateurs à la fin de chaque jour (semaine,
   *  mois) de la période ; le point qui contient aujourd'hui est l'état
   *  présent et égale `total`. */
  series: KpiSeriesPoint[];
}

/** Bon en retard de restitution (top 10, les plus en retard d'abord). */
export interface KpiParcReturnOverdueItem {
  bonId: string;
  reference: string;
  /** Nom affiché de la filiale. */
  filiale: string;
  /** Nom affiché du collaborateur. */
  collaborateur: string;
  /** Date de restitution prévue, au format AAAA-MM-JJ. */
  dateRestitution: KpiDate;
  daysLate: number;
  /** Équipements en circulation sur ce bon. */
  equipments: number;
}

/** « Retour en retard » (état du jour) : équipements en circulation dont la
 *  date de restitution prévue est dépassée ; `avgDays`/`medianDays` par bon. */
export interface KpiParcReturnOverdue {
  bons: number;
  equipments: number;
  /** `null` sans aucun bon en retard. */
  avgDays: number | null;
  /** `null` sans aucun bon en retard. */
  medianDays: number | null;
  top: KpiParcReturnOverdueItem[];
}

/** Non-restitutions. */
export interface KpiParcNotReturned {
  /** Équipements déclarés non restitués sur la période (pas des déclarations). */
  declared: KpiCompared;
  /** Équipements retrouvés sur la période. */
  found: KpiCompared;
  /** Part des bons clôturés sur la période ayant au moins un équipement non restitué. */
  closedBonsShare: KpiRatioCompared;
  /** Équipements encore non restitués aujourd'hui, bons clôturés compris, hors bons annulés. */
  openNow: number;
}

/** GET /api/kpi/parc — parc en circulation, retards de restitution, non-rendus. */
export interface KpiParcResponse extends KpiEnvelope {
  loaned: KpiParcLoaned;
  returnOverdue: KpiParcReturnOverdue;
  notReturned: KpiParcNotReturned;
}

// ─── GET /api/kpi/delais ──────────────────────────────────────────────────────

/** Étape de signature suivie par les délais et l'attente. */
export type KpiWorkflowStep = Extract<SignatureType, 'mise_disposition' | 'restitution' | 'pv_cloture'>;

/** Point de la série des volumes. */
export interface KpiDelaisVolumeSeriesPoint {
  bucket: KpiDate;
  created: number;
  sent: number;
  archived: number;
}

/** Bons créés, envoyés, archivés et annulés sur la période. */
export interface KpiDelaisVolumes {
  created: KpiCompared;
  sent: KpiCompared;
  archived: KpiCompared;
  cancelled: KpiCompared;
  series: KpiDelaisVolumeSeriesPoint[];
}

/** Nombre de bons par statut (état instantané) : toujours les huit statuts,
 *  dans l'ordre draft, sent_mise_dispo, active, sent_restitution,
 *  partially_returned, contested, archived, cancelled, à 0 si absents. */
export interface KpiStatusBreakdownItem {
  status: BonStatus;
  /** Libellé du lexique (bons/bon-status.ts, BON_STATUS_LABELS). */
  label: string;
  count: number;
}

/** Médiane et 90ᵉ centile du délai création → premier envoi, en heures. */
export interface KpiCreationToSendMetrics {
  medianHours: number | null;
  p90Hours: number | null;
}

/** Délai création → premier envoi. */
export interface KpiCreationToSend extends KpiCreationToSendMetrics {
  /** Bons envoyés pour la première fois sur la période courante. */
  count: number;
  previous: KpiCreationToSendMetrics;
}

/** Délai envoi → signature d'une étape. `within48h` et `within7d` sont des
 *  parts (0 à 1). Toutes les valeurs sont `null` sans signature. */
export interface KpiSendToSignatureMetrics {
  medianHours: number | null;
  p90Hours: number | null;
  within48h: number | null;
  within7d: number | null;
}

/** Délai envoi → signature d'une étape, période courante et précédente. */
export interface KpiSendToSignatureStep extends KpiSendToSignatureMetrics {
  /** Signatures de la période courante. */
  count: number;
  previous: KpiSendToSignatureMetrics;
}

/** Délai envoi → signature, par étape. */
export interface KpiSendToSignature {
  mise_disposition: KpiSendToSignatureStep;
  restitution: KpiSendToSignatureStep;
  pv_cloture: KpiSendToSignatureStep;
}

/** Mode de signature (toutes étapes confondues) ; `remote` = total − présentiel. */
export interface KpiSignatureMode {
  inPerson: KpiCompared;
  remote: KpiCompared;
  proxy: KpiCompared;
}

/** Durée de prêt des bons archivés sur la période, en jours. */
export interface KpiLoanDuration {
  /** Bons archivés sur la période courante. */
  count: number;
  avgDays: KpiRatioCompared;
  medianDays: KpiRatioCompared;
}

/** Signatures attendues à une étape (état du jour). */
export interface KpiWaitingStep {
  step: KpiWorkflowStep;
  /** « Remise à signer », « Restitution à signer », « PV de non-restitution à signer ». */
  label: string;
  count: number;
  /** Ancienneté moyenne de la demande de signature (`awaitingSince`), en jours ; `null` si aucun bon. */
  avgAgeDays: number | null;
  /** Bons en « Signature en retard » (seuil `thresholdDays`). */
  overdue: number;
}

/** Signatures attendues : toujours trois étapes, dans l'ordre mise_disposition,
 *  restitution, pv_cloture. Somme des `count` = tuile « Signatures attendues »,
 *  `overdueTotal` = tuile « Signature en retard » (sans filtre filiale). */
export interface KpiWaiting {
  /** Seuil de retard en jours (configuration `rappels.signature_overdue_days`). */
  thresholdDays: number;
  /** Somme des `overdue` des étapes. */
  overdueTotal: number;
  steps: KpiWaitingStep[];
}

/** GET /api/kpi/delais — volumes, répartition par statut, délais de
 *  traitement et signatures en attente. */
export interface KpiDelaisResponse extends KpiEnvelope {
  volumes: KpiDelaisVolumes;
  statusBreakdown: KpiStatusBreakdownItem[];
  creationToSend: KpiCreationToSend;
  sendToSignature: KpiSendToSignature;
  signatureMode: KpiSignatureMode;
  loanDuration: KpiLoanDuration;
  waiting: KpiWaiting;
}

// ─── GET /api/kpi/incidents ───────────────────────────────────────────────────

/** Motif d'une remise ou d'une clôture sans signature (période courante, dix
 *  au plus) ; « Non renseigné » si le motif est vide. */
export interface KpiClosureReason {
  reason: string;
  count: number;
}

/** Contestations. `received`, `decided`, `founded`, `notRetained` : flux sur
 *  la période ; `toProcess` : état du jour (même nombre que la page
 *  Contestations filtrée « à traiter »). */
export interface KpiIncidentsContestations {
  received: KpiCompared;
  /** Contestations ouvertes ou prises en charge, pas encore tranchées. */
  toProcess: number;
  /** Tranchées sur la période (Fondées + Non retenues). */
  decided: KpiCompared;
  founded: KpiCompared;
  notRetained: KpiCompared;
  /** Délai médian entre réception et décision, en jours. */
  resolutionMedianDays: KpiRatioCompared;
}

/** Rappels envoyés pour un rang donné (le rang est compté par document). */
export interface KpiReminderRankStat {
  rank: number;
  sent: KpiCompared;
  /** Rappels suivis de la signature du même document, sans autre rappel entre-temps. */
  signedAfter: KpiCompared;
  /** `signedAfter.current / sent.current`, `null` si aucun rappel envoyé. */
  efficiency: number | null;
}

/** Rappels : `byRank` contient toujours les rangs 1 à 3 (à 0 si besoin), plus
 *  les rangs supérieurs observés sur l'une des deux périodes, triés par rang. */
export interface KpiIncidentsReminders {
  byRank: KpiReminderRankStat[];
  /** Documents (bon et type de document) ayant reçu leur 3ᵉ rappel sur la période. */
  documentsWithThreeOrMore: KpiCompared;
}

/** GET /api/kpi/incidents — non-restitutions, PV, remises et clôtures sans
 *  signature, annulations, contestations, rappels et emails en échec. */
export interface KpiIncidentsResponse extends KpiEnvelope {
  notReturned: {
    /** Équipements déclarés non restitués sur la période. */
    declared: KpiCompared;
    /** Équipements retrouvés sur la période. */
    found: KpiCompared;
    /** Équipements encore non restitués aujourd'hui (état du jour). */
    stillMissing: number;
  };
  pvCloture: {
    /** PV de non-restitution émis sur la période. */
    emitted: KpiCompared;
  };
  /** Deux gestes distincts : « Remise constatée sans signature » (le bon passe
   *  « En cours ») et « Clôturé sans signature » (le bon passe « Clôturé »). */
  withoutSignature: {
    handovers: KpiCompared;
    closures: KpiCompared;
    handoverReasons: KpiClosureReason[];
    closureReasons: KpiClosureReason[];
  };
  cancellations: {
    /** Bons annulés sur la période. */
    count: KpiCompared;
  };
  contestations: KpiIncidentsContestations;
  reminders: KpiIncidentsReminders;
  failedEmails: {
    /** Emails en échec d'envoi ou rejetés ; jamais `skipped` (bon sans adresse). */
    count: KpiCompared;
  };
}

// ─── GET /api/kpi/aujourdhui ──────────────────────────────────────────────────

/** Ligne d'une section « À traiter » : le bon concerné et la date depuis
 *  laquelle la situation dure. */
export interface KpiTodayRow {
  bonId: string;
  reference: string;
  collaborateurId: string;
  /** Nom affiché du collaborateur. */
  collaborateur: string;
  /** Début de la situation : création du brouillon, demande de signature,
   *  expiration du lien, date de restitution prévue, réception de la
   *  contestation, ou date de remise la plus ancienne pour un départ. */
  since: IsoDateTime;
  /** Précision (« 2 équipements », « En cours d'examen »), ou `null`. */
  detail: string | null;
}

/** Section « À traiter » : `total` = tuile = liste « Voir tout » ; `rows` =
 *  les cinq situations les plus anciennes. */
export interface KpiTodaySection {
  total: number;
  rows: KpiTodayRow[];
}

/** Bons ouverts d'une filiale active (filiales à zéro omises). */
export interface KpiTodayFilialeCount {
  id: string;
  name: string;
  count: number;
}

/** GET /api/kpi/aujourdhui — accueil IT. Tous les chiffres sont des états du
 *  jour ; chacun est calculé par le prédicat de la liste qu'il ouvre
 *  (backend/src/common/bon-predicates.ts). */
export interface KpiTodayResponse {
  asOf: IsoDateTime;
  /** Seuil de « Signature en retard », en jours. */
  signatureOverdueDays: number;
  /** Bons ni clôturés ni annulés. */
  openBons: number;
  /** Bons « En cours ». */
  activeBons: number;
  /** Bons « Restitution en cours ». */
  restitutionInProgress: number;
  /** Bons dont une signature du collaborateur est attendue. */
  awaitingSignatures: number;
  /** Bons dont la signature est attendue depuis plus de `signatureOverdueDays` jours. */
  overdueSignatures: number;
  /** « Retour en retard » : équipements, et bons qui les portent. */
  overdueReturns: { equipments: number; bons: number };
  contestationsToProcess: number;
  /** Bons dont le lien de signature a expiré sans être renvoyé. */
  expiredLinks: number;
  /** Collaborateurs au compte désactivé qui détiennent encore des équipements. */
  departures: { collaborateurs: number; equipments: number };
  openBonsByFiliale: KpiTodayFilialeCount[];
  toDo: {
    drafts: KpiTodaySection;
    overdueSignatures: KpiTodaySection;
    expiredLinks: KpiTodaySection;
    overdueReturns: KpiTodaySection;
    contestations: KpiTodaySection;
    departures: KpiTodaySection;
    /** « Restitution partielle à signer » : bons « Restitution en cours »
     *  dont des équipements rendus attendent la signature de leur restitution
     *  (même règle que `GET /bons?subStatus=partial_restitution_to_sign`),
     *  depuis la demande de signature ; `detail` = équipements à signer. */
    partialRestitutionsToSign: KpiTodaySection;
  };
}

// ─── GET /api/kpi/liste ────────────────────────────────────────────────────────

/** Chiffres « sur la période » qui ouvrent la liste de ce qu'ils comptent
 *  (onglet Délais : bons créés, envoyés, clôturés, annulés ; onglet
 *  Incidents : PV émis, remises et clôtures sans signature, bons annulés,
 *  contestations reçues, emails en échec). */
export type KpiListKey =
  | 'bons_crees'
  | 'bons_envoyes'
  | 'bons_clotures'
  | 'bons_annules'
  | 'pv_emis'
  | 'remises_sans_signature'
  | 'clotures_sans_signature'
  | 'contestations_recues'
  | 'emails_en_echec';

/** Une ligne de la liste : un bon, ou un événement de ce bon (un PV, une
 *  remise sans signature, une contestation, un email). */
export interface KpiListItem {
  /** Identifiant de l'élément compté (bon, entrée du journal, contestation ou email). */
  id: string;
  bonId: string;
  reference: string;
  status: BonStatus;
  collaborateur: string;
  filiale: string;
  /** Date de l'élément : création, premier envoi, clôture, annulation,
   *  émission, réception ou tentative d'envoi selon le chiffre. */
  at: IsoDateTime;
  /** Précision lisible : motif (annulation, remise ou clôture sans
   *  signature), issue d'une contestation (« À traiter », « Fondée »,
   *  « Non retenue »), destinataire et nature de l'échec d'un email ; sinon null. */
  detail: string | null;
}

/** GET /api/kpi/liste?indicateur=…&from&to&filialeId&page&limit (admin,
 *  technician ; la direction n'ouvre pas de bon) : la liste exacte de ce que
 *  compte la carte, pour la même période et la même filiale — `total` égale
 *  la valeur de la carte. Plus récents d'abord ; `limit` 50 par défaut, 200 au
 *  plus. Non mise en cache. */
export interface KpiListResponse {
  indicateur: KpiListKey;
  period: { from: KpiDate; to: KpiDate };
  items: KpiListItem[];
  total: number;
  page: number;
  limit: number;
}
