import { Ban, FileWarning, Handshake, MessageSquareWarning, PackageX, Search, XCircle } from 'lucide-react';
import type { KpiCardProps } from '../../components/KpiCard';
import { asOfLabel, periodLabel, UNITS } from '../../lib/kpi-scope';
import type { IncidentsKpiResponse } from '../../types/incidents';
import { TODAY_LINKS } from '../today/today-links';

export type IncidentCard = KpiCardProps & { key: string };


/** Cartes « état du jour » de l'onglet Incidents (non filtrées par la période). */
export function incidentStateCards(data: IncidentsKpiResponse, isIt: boolean): IncidentCard[] {
  const scope = asOfLabel(data.asOf);
  return [
    {
      key: 'still-missing', label: 'Encore non restitués', value: data.notReturned.stillMissing, unit: UNITS.equipments,
      icon: PackageX, scope, tone: data.notReturned.stillMissing > 0 ? 'warning' : 'default',
      definition: 'Équipements déclarés non restitués et pas retrouvés depuis, y compris sur des bons clôturés.',
    },
    {
      key: 'contestations-to-process', label: 'Contestations à traiter', value: data.contestations.toProcess,
      unit: UNITS.contestations, icon: MessageSquareWarning, scope,
      tone: data.contestations.toProcess > 0 ? 'warning' : 'default',
      detail: 'ouvertes ou en cours d’examen', href: isIt ? TODAY_LINKS.contestations : undefined,
    },
  ];
}

/** Cartes « sur la période » de l'onglet Incidents, comparées à la période
 *  précédente. */
export function incidentFlowCards(data: IncidentsKpiResponse): IncidentCard[] {
  const scope = periodLabel(data.period);
  const { notReturned, withoutSignature } = data;
  return [
    {
      key: 'declared', label: 'Équipements déclarés non restitués', value: notReturned.declared.current,
      unit: UNITS.equipments, icon: PackageX, scope, delta: { ...notReturned.declared, invert: true },
      definition: 'Équipements déclarés non restitués pendant la période : une déclaration de trois équipements en compte trois.',
    },
    {
      key: 'found', label: 'Équipements retrouvés', value: notReturned.found.current, unit: UNITS.equipments,
      icon: Search, scope, delta: notReturned.found,
    },
    {
      key: 'pv', label: 'PV de non-restitution émis', value: data.pvCloture.emitted.current, unit: UNITS.pv,
      icon: FileWarning, scope, delta: { ...data.pvCloture.emitted, invert: true },
    },
    {
      key: 'handovers', label: 'Remises constatées sans signature', value: withoutSignature.handovers.current,
      unit: UNITS.bons, icon: Handshake, scope, delta: { ...withoutSignature.handovers, invert: true },
      definition: "Bons passés « En cours » sans la signature du collaborateur : le technicien a constaté la remise, avec un motif.",
    },
    {
      key: 'closures', label: 'Clôturés sans signature', value: withoutSignature.closures.current,
      unit: UNITS.bons, icon: Ban, scope, delta: { ...withoutSignature.closures, invert: true },
      definition: "Bons clôturés sans la signature du collaborateur (restitution ou PV), avec un motif. À ne pas confondre avec une remise constatée sans signature.",
    },
    {
      key: 'cancellations', label: 'Bons annulés', value: data.cancellations.count.current, unit: UNITS.bons,
      icon: XCircle, scope, delta: { ...data.cancellations.count, invert: true },
    },
    {
      key: 'contestations-received', label: 'Contestations reçues', value: data.contestations.received.current,
      unit: UNITS.contestations, icon: MessageSquareWarning, scope, delta: { ...data.contestations.received, invert: true },
      detail: `${data.contestations.toProcess} encore à traiter aujourd'hui`,
    },
  ];
}
