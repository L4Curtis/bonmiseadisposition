import { resolvePeriod } from '../kpi-period';
import {
  loanedTotalsQuery,
  loanedSeriesQuery,
  returnOverdueAggregateQuery,
  returnOverdueTopQuery,
  notReturnedOpenNowQuery,
} from '../kpi-parc.queries';

/**
 * Spec ciblée sur les fonctions pures de construction SQL extraites de
 * KpiParcService (cf. kpi-parc.service.spec.ts pour le contrat complet
 * bout-en-bout, mocké au niveau du service). Ici on vérifie directement le
 * texte/paramètres produits par les fonctions elles-mêmes : présence du
 * filtre filiale (cas nominal / cas limite sans filiale) et partage correct
 * de la CTE `lateBonsCte` entre les deux requêtes de retard.
 */
describe('kpi-parc.queries', () => {
  it('ajoute le filtre filiale quand filialeId est fourni', () => {
    const query = loanedTotalsQuery('f1');
    expect(query.sql).toContain('AND b.filiale_id =');
    expect(query.values).toContain('f1');
  });

  it("n'ajoute aucun filtre filiale quand filialeId est absent", () => {
    const query = loanedTotalsQuery();
    expect(query.sql).not.toContain('filiale_id');
    expect(query.values).not.toContain('f1');
  });

  it('returnOverdueAggregateQuery et returnOverdueTopQuery partagent la même CTE lateBonsCte (mêmes conditions, mêmes paramètres)', () => {
    const aggregate = returnOverdueAggregateQuery('f1');
    const top = returnOverdueTopQuery('f1');

    expect(aggregate.sql).toContain('WITH late AS (');
    expect(top.sql).toContain('WITH late AS (');
    expect(aggregate.sql).toContain('b.date_restitution < (now()');
    expect(top.sql).toContain('b.date_restitution < (now()');
    expect(aggregate.values).toEqual(top.values.slice(0, aggregate.values.length));
  });

  it('notReturnedOpenNowQuery exclut toujours archived et cancelled (cast texte, pas de comparaison directe sur enum)', () => {
    const query = notReturnedOpenNowQuery();
    expect(query.sql).toMatch(/b\.status::text NOT IN \(\?,\s?\?\)/);
    expect(query.values).toEqual(['archived', 'cancelled']);
    expect(query.sql).not.toMatch(/b\.status\s+NOT\s+IN\s*\(/);
  });

  it('loanedSeriesQuery aligne generate_series sur la granularité et compare la fin de bucket en fuseau Paris', () => {
    const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });
    const query = loanedSeriesQuery(period, 'f1');

    expect(query.sql).toContain('generate_series');
    expect(query.sql).toContain("AT TIME ZONE 'Europe/Paris'");
    expect(query.values).toContain('f1');
  });

  it('loanedSeriesQuery ne filtre pas par filiale quand filialeId est absent', () => {
    const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-10' });
    const query = loanedSeriesQuery(period);
    expect(query.sql).not.toContain('filiale_id');
  });
});
