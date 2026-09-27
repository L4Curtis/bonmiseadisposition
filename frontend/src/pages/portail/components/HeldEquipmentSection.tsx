import { Link } from 'react-router';
import { ChevronRight, Package, PenLine } from 'lucide-react';
import { formatDateLong } from '@/lib/dates';
import type { HeldEquipment } from '../lib/portal-classification';
import { categoryText } from '../lib/portal-labels';

/** Le bouton « Signer la remise » n'apparaît qu'une fois par bon, sur son
 *  premier équipement : trois équipements d'une même remise ne portent pas
 *  trois fois le même bouton. */
function firstOfEachBon(items: readonly HeldEquipment[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const firsts = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.bon.id)) firsts.add(item.id);
    seen.add(item.bon.id);
  }
  return firsts;
}

function HeldEquipmentCard({ item, showSignAction }: { item: HeldEquipment; showSignAction: boolean }) {
  const category = categoryText(item.category);
  return (
    <li className={`rounded-xl border bg-card p-4 shadow-sm ${item.awaitingSignature ? 'border-warning/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-foreground [overflow-wrap:anywhere]">{item.label}</p>
        {item.awaitingSignature && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">À signer</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {category && <span>{category} · </span>}
        N° de série{' '}
        <span className="font-mono text-foreground [overflow-wrap:anywhere]">{item.serialNumber || 'non renseigné'}</span>
      </p>
      {item.inventoryNumber && (
        <p className="text-sm text-muted-foreground">
          N° d'inventaire <span className="font-mono text-foreground [overflow-wrap:anywhere]">{item.inventoryNumber}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {item.awaitingSignature ? 'Remis le ' : 'Chez vous depuis le '}
        {formatDateLong(item.since)}
      </p>
      {/* Lien sur sa propre ligne, zone de toucher de 44 px sans marge visuelle en plus. */}
      <Link
        to={`/mes-bons/${item.bon.id}`}
        className="-mb-2 inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        Voir le bon {item.bon.reference}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      {item.awaitingSignature && (
        <p className="text-sm text-muted-foreground">Confirmez sa réception en signant la remise.</p>
      )}
      {showSignAction && item.signToken && (
        <a
          href={`/signer/${item.signToken}`}
          className="btn-gradient mt-2 w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" /> Signer la remise
          <span className="sr-only"> du bon {item.bon.reference}</span>
        </a>
      )}
    </li>
  );
}

/** « Chez vous » : chaque équipement remis à la personne, avec son n° de
 *  série, sans ouvrir un bon (R-090) — y compris celui d'une remise encore à
 *  signer, marqué « À signer ». */
export function HeldEquipmentSection({ items }: { items: readonly HeldEquipment[] }) {
  const firsts = firstOfEachBon(items);
  return (
    <section aria-labelledby="equipements-titre">
      <h2 id="equipements-titre" className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Package className="h-4 w-4" /> Chez vous ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Vous n'avez aucun équipement de l'équipe informatique en ce moment.
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <HeldEquipmentCard key={item.id} item={item} showSignAction={firsts.has(item.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
