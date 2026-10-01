import type { CsvTable } from '../../common/csv';
import type { KpiDelaisResponse, KpiEnvelope, KpiIncidentsResponse, KpiParcResponse } from '../kpi-types';
import { contextRows, KPI_CSV_HEADER, KpiCsvRow } from './kpi-csv-format';
import { parcCsvRows } from './kpi-parc-csv';
import { delaisCsvRows } from './kpi-delais-csv';
import { incidentsCsvRows } from './kpi-incidents-csv';

/** Onglets exportables du tableau de bord (« Aujourd'hui » n'a pas d'export :
 *  ses lignes mènent à des listes, qui ont le leur). */
export type KpiExportTab = 'parc' | 'delais' | 'incidents';

interface TabExport<T extends KpiEnvelope> {
  readonly label: string;
  readonly rows: (data: T) => KpiCsvRow[];
}

const PARC: TabExport<KpiParcResponse> = { label: 'Parc', rows: parcCsvRows };
const DELAIS: TabExport<KpiDelaisResponse> = { label: 'Délais', rows: delaisCsvRows };
const INCIDENTS: TabExport<KpiIncidentsResponse> = { label: 'Incidents', rows: incidentsCsvRows };

/** Fichier prêt à envoyer par `sendCsv` : nom sans date d'export (la période
 *  le date déjà) et tableau. */
export interface KpiCsvFile {
  readonly filename: string;
  readonly table: CsvTable;
}

function fileFor<T extends KpiEnvelope>(tab: KpiExportTab, def: TabExport<T>, data: T, filialeName: string | null): KpiCsvFile {
  return {
    filename: `indicateurs-${tab}-${data.period.from}-au-${data.period.to}`,
    table: { header: KPI_CSV_HEADER, rows: [...contextRows(def.label, data, filialeName), ...def.rows(data)] },
  };
}

/** Export de l'onglet « Parc » (mêmes chiffres que `GET /kpi/parc`). */
export function parcCsvFile(data: KpiParcResponse, filialeName: string | null): KpiCsvFile {
  return fileFor('parc', PARC, data, filialeName);
}

/** Export de l'onglet « Délais » (mêmes chiffres que `GET /kpi/delais`). */
export function delaisCsvFile(data: KpiDelaisResponse, filialeName: string | null): KpiCsvFile {
  return fileFor('delais', DELAIS, data, filialeName);
}

/** Export de l'onglet « Incidents » (mêmes chiffres que `GET /kpi/incidents`). */
export function incidentsCsvFile(data: KpiIncidentsResponse, filialeName: string | null): KpiCsvFile {
  return fileFor('incidents', INCIDENTS, data, filialeName);
}
