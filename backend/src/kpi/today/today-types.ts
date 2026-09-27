/**
 * Réponse de `GET /kpi/aujourdhui` (accueil IT). Miroir de
 * `contracts/kpi.ts` (`KpiTodayResponse`) : ce type est celui que le service
 * construit, le contrat celui que l'interface lit.
 */

/** Une ligne d'une section « À traiter » : le bon concerné et la date depuis
 *  laquelle la situation dure. */
export interface TodayRow {
  bonId: string;
  reference: string;
  collaborateurId: string;
  collaborateur: string;
  /** Début de la situation (création, demande de signature, date de retour
   *  prévue, réception, expiration du lien), date-heure ISO. */
  since: string;
  /** Précision (« 2 équipements », « En cours d'examen »), ou `null`. */
  detail: string | null;
}

export interface TodaySection {
  /** Même nombre que la tuile et que la liste « Voir tout ». */
  total: number;
  rows: TodayRow[];
}

export interface TodayFilialeCount {
  id: string;
  name: string;
  count: number;
}

export interface KpiTodayResponse {
  /** Instant du calcul : tous les chiffres sont des états du jour. */
  asOf: string;
  /** Seuil de « Signature en retard », en jours (réglage des rappels). */
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
  /** Équipements (et bons) dont la date de restitution prévue est dépassée. */
  overdueReturns: { equipments: number; bons: number };
  /** Contestations reçues et pas encore tranchées. */
  contestationsToProcess: number;
  /** Bons dont le lien de signature a expiré sans être renvoyé. */
  expiredLinks: number;
  /** Collaborateurs au compte désactivé qui détiennent encore des équipements. */
  departures: { collaborateurs: number; equipments: number };
  /** Bons ouverts par filiale active (filiales à zéro omises) ; somme = `openBons`
   *  hors filiales désactivées. */
  openBonsByFiliale: TodayFilialeCount[];
  toDo: {
    drafts: TodaySection;
    overdueSignatures: TodaySection;
    expiredLinks: TodaySection;
    overdueReturns: TodaySection;
    contestations: TodaySection;
    departures: TodaySection;
    /** Bons dont des équipements rendus attendent la signature de leur
     *  restitution (sous-état « Restitution partielle à signer »). */
    partialRestitutionsToSign: TodaySection;
  };
}

/** Étape d'une contestation à traiter, en toutes lettres (mêmes mots que la
 *  page Contestations). */
export const CONTESTATION_STATUS_LABELS_SHORT: Readonly<Record<string, string>> = {
  open: 'Ouverte',
  in_review: "En cours d'examen",
};
