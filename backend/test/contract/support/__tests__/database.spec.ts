/**
 * Garde-fou de la base des tests de contrat : ces tests VIDENT la base qu'on
 * leur donne. Aucune adresse ne doit pouvoir désigner la base de
 * développement (`bons_disposition`), même héritée de DATABASE_URL.
 * Exécuté par `npm test` (aucune base nécessaire).
 */
import { CONTRACT_DATABASE_ENV, isContractDatabaseName, resolveContractDatabaseUrl } from '../database';

const DEV_URL = 'postgresql://app:secret@127.0.0.1:5432/bons_disposition';
const CONTRACT_URL = 'postgresql://app:contract@127.0.0.1:5433/bons_contract';

describe('resolveContractDatabaseUrl', () => {
  it('accepte une base dont le nom contient « contract »', () => {
    expect(resolveContractDatabaseUrl({ [CONTRACT_DATABASE_ENV]: CONTRACT_URL })).toBe(CONTRACT_URL);
  });

  it('refuse de se rabattre sur DATABASE_URL quand la variable dédiée manque', () => {
    expect(() => resolveContractDatabaseUrl({ DATABASE_URL: DEV_URL })).toThrow(`${CONTRACT_DATABASE_ENV} n'est pas définie`);
  });

  it('refuse la base de développement, même désignée par la variable dédiée', () => {
    expect(() => resolveContractDatabaseUrl({ [CONTRACT_DATABASE_ENV]: DEV_URL })).toThrow('son nom doit contenir « contract »');
  });

  it('ne se laisse pas tromper par « contract » ailleurs que dans le nom de la base', () => {
    const disguised = 'postgresql://contract:contract@contract.local:5432/bons_disposition?schema=contract';
    expect(() => resolveContractDatabaseUrl({ [CONTRACT_DATABASE_ENV]: disguised })).toThrow('bons_disposition');
  });

  it('refuse une adresse illisible', () => {
    expect(() => resolveContractDatabaseUrl({ [CONTRACT_DATABASE_ENV]: 'pas une adresse' })).toThrow('adresse PostgreSQL valide');
  });
});

describe('isContractDatabaseName (nom annoncé par PostgreSQL)', () => {
  it('reconnaît la base jetable, sans tenir compte de la casse', () => {
    expect(isContractDatabaseName('bons_contract')).toBe(true);
    expect(isContractDatabaseName('BONS_CONTRACT')).toBe(true);
  });

  it('rejette la base de développement et un nom vide', () => {
    expect(isContractDatabaseName('bons_disposition')).toBe(false);
    expect(isContractDatabaseName('')).toBe(false);
  });
});
