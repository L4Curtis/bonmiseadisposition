import { UserCheck, UserCog, Wifi } from 'lucide-react';
import { KpiCard } from '../../components/KpiCard';
import { UNITS } from '../../lib/kpi-scope';
import type { SignatureModeCounts } from '../../types/delais';
import { NO_LIST } from '../../lists/kpi-lists';
import type { ListHref } from '../incidents/incident-stat-cards';

export interface SignatureModeTilesProps {
  signatureMode: SignatureModeCounts;
  /** « du 27/08 au 25/09 ». */
  scope: string;
  /** Listes des documents signés (IT) ; `null` pour la direction. */
  listHref: ListHref;
}

/** Comment les documents ont été signés sur la période, toutes étapes
 *  confondues, comparé à la période précédente. Chaque carte ouvre la liste
 *  des documents qu'elle compte (IT). */
export function SignatureModeTiles({ signatureMode, scope, listHref }: SignatureModeTilesProps) {
  const list = (key: 'signatures_a_distance' | 'signatures_sur_place' | 'signatures_mandatees') =>
    listHref ? { href: listHref(key) } : { noList: NO_LIST.direction };
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        label="À distance, par le lien reçu" value={signatureMode.remote.current} unit={UNITS.signatures}
        icon={Wifi} scope={scope} delta={signatureMode.remote} {...list('signatures_a_distance')}
        definition="Documents (remise, restitution, PV de non-restitution) signés par le collaborateur depuis le lien reçu par email."
      />
      <KpiCard
        label="Sur place, devant le technicien" value={signatureMode.inPerson.current} unit={UNITS.signatures}
        icon={UserCheck} scope={scope} delta={signatureMode.inPerson} {...list('signatures_sur_place')}
        definition="Documents signés au guichet, sur l'appareil de l'équipe informatique, y compris par une personne mandatée."
      />
      <KpiCard
        label="Par une personne mandatée" value={signatureMode.proxy.current} unit={UNITS.signatures}
        icon={UserCog} scope={scope} delta={signatureMode.proxy} {...list('signatures_mandatees')}
        definition="Signatures apposées par une autre personne que le titulaire, qui n'est pas de l'équipe informatique et qu'il y a autorisée (procuration). Un technicien présent au guichet est un témoin, pas un mandataire. Elles sont comptées aussi dans « à distance » ou « sur place »."
      />
    </div>
  );
}
