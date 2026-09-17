import { UserCheck, Wifi, UserCog } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import type { SignatureModeCounts } from '../../types/delais';

export interface SignatureModeTilesProps {
  signatureMode: SignatureModeCounts;
}

/** Répartition du mode de signature (présentiel / distant / mandataire) —
 *  trois mini-tuiles réutilisant `StatCard` avec comparaison à la période
 *  précédente. */
export function SignatureModeTiles({ signatureMode }: SignatureModeTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Présentiel"
        value={signatureMode.inPerson.current}
        icon={UserCheck}
        delta={{ current: signatureMode.inPerson.current, previous: signatureMode.inPerson.previous }}
      />
      <StatCard
        label="Distant"
        value={signatureMode.remote.current}
        icon={Wifi}
        delta={{ current: signatureMode.remote.current, previous: signatureMode.remote.previous }}
      />
      <StatCard
        label="Mandataire"
        value={signatureMode.proxy.current}
        icon={UserCog}
        delta={{ current: signatureMode.proxy.current, previous: signatureMode.proxy.previous }}
      />
    </div>
  );
}
