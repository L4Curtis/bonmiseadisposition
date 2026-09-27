import { UserCheck, UserCog, Wifi } from 'lucide-react';
import { KpiCard } from '../../components/KpiCard';
import { UNITS } from '../../lib/kpi-scope';
import type { SignatureModeCounts } from '../../types/delais';

export interface SignatureModeTilesProps {
  signatureMode: SignatureModeCounts;
  /** « du 27/08 au 25/09 ». */
  scope: string;
}

/** Comment les documents ont été signés sur la période, toutes étapes
 *  confondues, comparé à la période précédente. */
export function SignatureModeTiles({ signatureMode, scope }: SignatureModeTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <KpiCard
        label="À distance, par le lien reçu" value={signatureMode.remote.current} unit={UNITS.signatures}
        icon={Wifi} scope={scope} delta={signatureMode.remote}
      />
      <KpiCard
        label="Sur place, devant le technicien" value={signatureMode.inPerson.current} unit={UNITS.signatures}
        icon={UserCheck} scope={scope} delta={signatureMode.inPerson}
      />
      <KpiCard
        label="Par une personne mandatée" value={signatureMode.proxy.current} unit={UNITS.signatures}
        icon={UserCog} scope={scope} delta={signatureMode.proxy}
        definition="Signatures apposées par une autre personne que le titulaire, qui n'est pas de l'équipe informatique et qu'il y a autorisée (procuration). Un technicien présent au guichet est un témoin, pas un mandataire. Elles sont comptées aussi dans « à distance » ou « sur place »."
      />
    </div>
  );
}
