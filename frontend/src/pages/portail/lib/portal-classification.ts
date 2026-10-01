import type { LinkSignatureType, PortalBon, PortalSignature } from '@/contracts/bons';
import type { SignatureInvalidationReason } from '@/contracts/common';

/**
 * Classement du portail par CE QUE LA PERSONNE DOIT FAIRE (R-057), et non par
 * la validité du lien :
 *  - « À signer » : chaque document que la personne peut signer (lien
 *    valide ou au guichet) ou dont elle peut redemander le lien (expiré) ;
 *  - « En attente d'un nouveau lien » : documents qu'elle ne peut ni signer ni
 *    redemander (bon modifié, lien déjà redemandé…) ;
 *  - « En cours de correction » : documents rouverts par une contestation
 *    Fondée ;
 *  - « En cours » : les bons où elle détient encore du matériel (ou dont la
 *    restitution n'est pas finie), sans rien à signer ;
 *  - « Contestés » : les bons en contestation ;
 *  - « Historique » : les bons clôturés.
 * « Mes équipements » liste, à part, chaque équipement encore chez elle.
 */

/** Un document à signer, prêt à afficher. */
export interface DocumentToSign {
  bon: PortalBon;
  type: LinkSignatureType;
  /** Jeton du lien signable, `null` si le lien a expiré ou se signe au guichet. */
  token: string | null;
  /** Jeton du dernier lien, même expiré, pour « Demander un nouveau lien » ;
   *  `null` si le serveur ne le fournit pas. */
  requestToken: string | null;
  /** Depuis quand le document attend : début de l'attente, sinon date du lien. */
  since: string | null;
  inPerson: boolean;
  expired: boolean;
  /** Le dernier lien a été invalidé avant usage : pourquoi (bon modifié,
   *  contestation Fondée…). `null` pour un lien valide ou simplement expiré. */
  invalidatedReason: SignatureInvalidationReason | null;
  /** Contestation Fondée de ce document : l'équipe informatique le corrige,
   *  puis le renverra. Rien à signer ni à demander d'ici là. */
  underCorrection: boolean;
  /** Nouveau lien déjà demandé pour ce document : quand (`null` sinon). */
  newLinkRequestedAt: string | null;
}

/** Un équipement encore chez le collaborateur. */
export interface HeldEquipment {
  id: string;
  bon: PortalBon;
  label: string;
  category: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  /** Chez lui depuis : date de mise à disposition du bon. */
  since: string;
  /** Matériel reçu dont la remise attend encore sa signature (« Remise à
   *  signer ») : il est bien chez la personne, mais c'est à confirmer. */
  awaitingSignature: boolean;
  /** Lien pour signer cette remise tout de suite, `null` si le lien a expiré
   *  ou si la remise se signe au guichet. */
  signToken: string | null;
  /** Remise à confirmer, mais son lien ne vaut plus et le nouveau n'est pas
   *  encore parti (bon modifié, lien déjà redemandé) : rien à signer d'ici là. */
  awaitingNewLink: boolean;
  /** Rendu ou déclaré non restitué, mais ce marquage est contesté (Fondée) et
   *  en cours de correction : il reste sous la responsabilité de la personne
   *  tant que la restitution corrigée n'est pas signée. */
  underCorrection: boolean;
}

export interface PortalGroups {
  /** Documents que la personne peut signer, ou dont elle peut redemander le
   *  lien : le bandeau compte exactement ceux-là. */
  toSign: DocumentToSign[];
  /** Documents rouverts après une contestation Fondée : l'équipe
   *  informatique les corrige, rien ne se signe d'ici là. */
  inCorrection: DocumentToSign[];
  /** Documents dont le nouveau lien n'est pas encore parti (bon modifié, lien
   *  déjà redemandé) : rien à signer ni à demander, hors du bandeau. */
  awaitingLink: DocumentToSign[];
  current: PortalBon[];
  contested: PortalBon[];
  history: PortalBon[];
  held: HeldEquipment[];
}

/** Statuts où le matériel du bon est (au moins en partie) chez la personne.
 *  « Remise à signer » en fait partie : le matériel est remis avant que la
 *  personne ne signe, elle doit le retrouver dans « Chez vous ». */
const HOLDING_STATUSES = new Set(['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested']);

/** Un lien ramené à l'origine des temps a été remplacé (convention du serveur). */
function isReplacedLink(signature: PortalSignature): boolean {
  return !!signature.invalidatedReason || new Date(signature.tokenExpiresAt).getTime() <= 1000;
}

/** Le document `type` attend-il une signature ? Oui si sa demande la plus
 *  récente n'est ni signée ni remplacée (une restitution partielle signée
 *  puis redemandée compte ; un vieux lien remplacé, non). */
function awaitsSignature(signatures: readonly PortalSignature[], type: LinkSignatureType): boolean {
  const latest = [...signatures]
    .filter((s) => s.type === type)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return !!latest && !latest.signed && !isReplacedLink(latest);
}

/** Document en attente : celui que calcule le serveur (`pendingSignature`),
 *  sinon déduit du statut (et, en restitution en cours, des signatures ; le
 *  PV passe avant une restitution partielle, comme le sous-état). */
function pendingType(bon: PortalBon): LinkSignatureType | null {
  if (bon.status === 'contested' || bon.status === 'archived' || bon.status === 'cancelled') return null;
  if (bon.pendingSignature !== undefined) return bon.pendingSignature?.type ?? null;
  if (bon.status === 'sent_mise_dispo') return 'mise_disposition';
  if (bon.status === 'sent_restitution') return 'restitution';
  if (bon.status !== 'partially_returned') return null;
  if (awaitsSignature(bon.signatures, 'pv_cloture')) return 'pv_cloture';
  return awaitsSignature(bon.signatures, 'restitution') ? 'restitution' : null;
}

/** Lien encore signable : jeton transmis, ni expiré ni remplacé. */
function isSignableLink(signature: PortalSignature | undefined): boolean {
  if (!signature?.token || isReplacedLink(signature)) return false;
  return new Date(signature.tokenExpiresAt).getTime() > Date.now();
}

function documentToSign(bon: PortalBon, type: LinkSignatureType): DocumentToSign {
  const signature = [...bon.signatures]
    .filter((s) => s.type === type && !s.signed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const pending = bon.pendingSignature;
  const token = signature?.token ?? null;
  const inPerson = pending?.inPerson ?? !!signature?.inPersonPending;
  // Le serveur transmet aussi le jeton du dernier lien EXPIRÉ (pour « Demander
  // un nouveau lien ») : un jeton présent ne prouve donc pas un lien valide.
  const expired = pending?.expired ?? (!inPerson && !isSignableLink(signature));
  // Un lien invalidé (bon modifié, contestation Fondée…) n'est pas « expiré » :
  // la personne doit lire le vrai motif (R-038), et rien n'est à redemander.
  const invalidatedReason = expired && !inPerson ? (signature?.invalidatedReason ?? null) : null;
  const since = bon.awaitingSince ?? signature?.createdAt ?? null;
  return {
    bon,
    type,
    token: expired ? null : token,
    requestToken: inPerson || invalidatedReason ? null : token,
    inPerson,
    expired,
    since,
    invalidatedReason,
    underCorrection: invalidatedReason === 'contested',
    // Champ facultatif du contrat : sans lui, la demande reste proposée.
    newLinkRequestedAt: pending?.newLinkRequestedAt ?? null,
  };
}

/** Ni signable, ni à redemander, ni en correction : le document attend un
 *  nouveau lien de l'équipe informatique (lien invalidé par une modification,
 *  ou nouveau lien déjà demandé). */
export function isAwaitingNewLink(doc: DocumentToSign): boolean {
  if (doc.inPerson || doc.token || doc.underCorrection) return false;
  return doc.invalidatedReason !== null || doc.newLinkRequestedAt !== null;
}

/** Équipement encore chez la personne : état calculé par le serveur, sinon
 *  ni rendu ni déclaré non restitué. */
function isHeld(eq: PortalBon['equipments'][number]): boolean {
  if (eq.returnState !== undefined) return eq.returnState === 'out';
  return !eq.returnedAt && !eq.notReturned;
}

/** Marquage non encore signé par la personne (rendu à signer, déclaré non
 *  restitué) : c'est lui qu'une contestation Fondée fait corriger. */
function isUnsignedMarking(eq: PortalBon['equipments'][number]): boolean {
  const state = eq.returnState ?? (eq.notReturned ? 'not_returned' : eq.returnedAt ? 'returned_to_sign' : 'out');
  return state === 'returned_to_sign' || state === 'not_returned';
}

/** Document du bon en cours de correction après une contestation Fondée. */
function isUnderCorrection(bon: PortalBon): boolean {
  const type = pendingType(bon);
  return !!type && type !== 'mise_disposition' && documentToSign(bon, type).underCorrection;
}

function equipmentLabel(eq: PortalBon['equipments'][number]): string {
  if (eq.catalogItem) return `${eq.catalogItem.brand} ${eq.catalogItem.model}`;
  return eq.customLabel || 'Équipement';
}

function heldEquipments(bon: PortalBon): HeldEquipment[] {
  if (!HOLDING_STATUSES.has(bon.status)) return [];
  const handover = bon.status === 'sent_mise_dispo' ? documentToSign(bon, 'mise_disposition') : null;
  const awaitingNewLink = !!handover && isAwaitingNewLink(handover);
  const awaitingSignature = !!handover && !awaitingNewLink;
  const signToken = handover && !handover.inPerson ? handover.token : null;
  const correcting = isUnderCorrection(bon);
  return [...bon.equipments]
    .sort((a, b) => a.order - b.order)
    .filter((eq) => isHeld(eq) || (correcting && isUnsignedMarking(eq)))
    .map((eq) => ({
      id: eq.id,
      bon,
      label: equipmentLabel(eq),
      category: eq.catalogItem?.category ?? null,
      serialNumber: eq.serialNumber,
      inventoryNumber: eq.inventoryNumber,
      since: bon.dateMiseDisposition,
      awaitingSignature,
      awaitingNewLink,
      signToken,
      underCorrection: correcting && isUnsignedMarking(eq),
    }));
}

/** Bons dont le remplaçant (contestation « Fondée ») figure déjà dans le
 *  portail avec du matériel chez la personne : le remplaçant reprend les
 *  mêmes équipements, l'original ne doit pas les montrer une seconde fois.
 *  Un remplaçant encore en préparation n'est pas dans le portail : l'original
 *  garde alors ses équipements. */
function supersededBonIds(bons: readonly PortalBon[]): ReadonlySet<string> {
  const holding = new Set(bons.filter((b) => HOLDING_STATUSES.has(b.status)).map((b) => b.id));
  return new Set(bons.filter((b) => b.replacedBy && holding.has(b.replacedBy.id)).map((b) => b.id));
}

export function classifyPortal(bons: readonly PortalBon[]): PortalGroups {
  const toSign: DocumentToSign[] = [];
  const inCorrection: DocumentToSign[] = [];
  const awaitingLink: DocumentToSign[] = [];
  const current: PortalBon[] = [];
  const contested: PortalBon[] = [];
  const history: PortalBon[] = [];
  for (const bon of bons) {
    const type = pendingType(bon);
    if (bon.status === 'contested') contested.push(bon);
    else if (type) {
      const doc = documentToSign(bon, type);
      (doc.underCorrection ? inCorrection : isAwaitingNewLink(doc) ? awaitingLink : toSign).push(doc);
    }
    else if (bon.status === 'archived' || bon.status === 'cancelled') history.push(bon);
    else current.push(bon);
  }
  const superseded = supersededBonIds(bons);
  const held = bons.filter((b) => !superseded.has(b.id)).flatMap(heldEquipments);
  return { toSign, inCorrection, awaitingLink, current, contested, history, held };
}
