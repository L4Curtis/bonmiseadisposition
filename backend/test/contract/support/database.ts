/**
 * Base des tests de contrat HTTP : lecture de son adresse et garde-fou.
 *
 * Les tests de contrat VIDENT puis remplissent la base qu'on leur donne. Ils ne
 * lisent donc jamais DATABASE_URL, qui désigne la base de développement (via
 * backend/.env), mais une variable dédiée, CONTRACT_DATABASE_URL. Le nom de la
 * base doit en plus contenir « contract » : une adresse copiée par erreur depuis
 * .env (base « bons_disposition ») est refusée avant la moindre écriture.
 */
export const CONTRACT_DATABASE_ENV = 'CONTRACT_DATABASE_URL';

const REQUIRED_NAME_FRAGMENT = 'contract';

const HOW_TO =
  'Lancer une base jetable puis la suite, par exemple :\n' +
  '  docker run -d --name bmad-contract-db -e POSTGRES_DB=bons_contract -e POSTGRES_USER=app \\\n' +
  '    -e POSTGRES_PASSWORD=contract -e TZ=UTC -p 127.0.0.1:5433:5432 postgres:16-alpine\n' +
  '  CONTRACT_DATABASE_URL=postgresql://app:contract@127.0.0.1:5433/bons_contract npm run test:contract\n' +
  'Voir docs/testing-guide.md, section « Tests de contrat HTTP ».';

/** Renvoie l'adresse de la base de contrat, ou lève une erreur explicite si
 *  elle manque ou ne désigne pas une base dédiée à ces tests. */
export function resolveContractDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[CONTRACT_DATABASE_ENV];
  if (!raw) {
    throw new Error(`${CONTRACT_DATABASE_ENV} n'est pas définie.\n${HOW_TO}`);
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
  } catch {
    throw new Error(`${CONTRACT_DATABASE_ENV} n'est pas une adresse PostgreSQL valide.\n${HOW_TO}`);
  }
  if (!databaseName.toLowerCase().includes(REQUIRED_NAME_FRAGMENT)) {
    throw new Error(
      `${CONTRACT_DATABASE_ENV} désigne la base « ${databaseName} » : son nom doit contenir ` +
        `« ${REQUIRED_NAME_FRAGMENT} ». Les tests de contrat effacent la base, ils refusent ` +
        `de viser une base de développement ou de production.\n${HOW_TO}`,
    );
  }
  return raw;
}

/** Le nom de la base réellement connectée doit lui aussi porter la marque :
 *  second contrôle, demandé à PostgreSQL une fois l'application lancée. */
export function isContractDatabaseName(name: string): boolean {
  return name.toLowerCase().includes(REQUIRED_NAME_FRAGMENT);
}
