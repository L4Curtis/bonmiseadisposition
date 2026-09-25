/** Formes vérifiées des contrats de src/contracts/filiales.ts. */
import type {
  Filiale,
  FilialeImportError,
  FilialeImportResult,
  FilialeSummary,
} from '../../../src/contracts/filiales';
import { arrayOf, bool, int, isoDate, nullable, object, str, uuid } from '../support/shape';

export const filiale = object<Filiale>({
  id: uuid,
  name: str,
  displayName: str,
  logoPath: nullable(str),
  stampPath: nullable(str),
  address: nullable(str),
  siret: nullable(str),
  active: bool,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const filialeSummary = object<FilialeSummary>({ id: uuid, name: str, displayName: str, active: bool });

export const filialeImportResult = object<FilialeImportResult>({
  created: int,
  updated: int,
  skipped: int,
  errors: arrayOf(object<FilialeImportError>({ index: int, message: str })),
});
