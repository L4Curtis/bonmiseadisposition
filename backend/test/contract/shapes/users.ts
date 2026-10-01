/** Formes vérifiées des contrats de src/contracts/users.ts et auth.ts. */
import type {
  AuthMeFiliale,
  AuthMeResponse,
  LocalAuthStatusResponse,
  LocalLoginResponse,
  SetupRequiredResponse,
} from '../../../src/contracts/auth';
import type {
  ChangeUserRoleResponse,
  ItStaffMember,
  ManualUserImportError,
  ManualUserImportLine,
  ManualUsersImportResult,
  UnlockUserResponse,
  User,
  UserPageMeta,
} from '../../../src/contracts/users';
import { civilite, listOf, listWithMeta, userRole } from '../support/common-shapes';
import { arrayOf, bool, int, isoDate, literal, nullable, object, optional, str, uuid } from '../support/shape';
import { filialeSummary } from './filiales';

export const user = object<User>({
  id: uuid,
  samAccountName: str,
  displayName: str,
  email: nullable(str),
  department: nullable(str),
  company: nullable(str),
  title: nullable(str),
  civilite: nullable(civilite),
  filialeId: nullable(uuid),
  filiale: nullable(filialeSummary),
  isItStaff: bool,
  role: userRole,
  isLocalAccount: bool,
  isManualAccount: bool,
  mustChangePassword: bool,
  active: bool,
  lastLdapSync: nullable(isoDate),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const userPage = listWithMeta(user, object<UserPageMeta>({ directoryActive: bool }), { minLength: 1 });

export const userSearch = listOf(user, { minLength: 1 });

export const itStaff = listOf(object<ItStaffMember>({ id: uuid, displayName: str }), { minLength: 2 });

export const manualUsersImportResult = object<ManualUsersImportResult>({
  created: int,
  updated: int,
  skipped: int,
  errors: arrayOf(object<ManualUserImportError>({ index: int, message: str })),
  lines: arrayOf(
    object<ManualUserImportLine>({
      index: int,
      status: literal('created', 'updated', 'skipped', 'error'),
      samAccountName: optional(str),
      displayName: optional(str),
      message: optional(str),
    }),
  ),
});

export const changeUserRole = object<ChangeUserRoleResponse>({ id: uuid, role: userRole, isItStaff: bool });

export const unlockUser = object<UnlockUserResponse>({ unlocked: literal(true), failedAttempts: int });

export const authMe = object<AuthMeResponse>({
  id: uuid,
  samAccountName: str,
  displayName: str,
  email: nullable(str),
  department: nullable(str),
  company: nullable(str),
  title: nullable(str),
  filialeId: nullable(uuid),
  filiale: nullable(object<AuthMeFiliale>({ id: uuid, name: str, displayName: str })),
  isItStaff: bool,
  role: userRole,
  isLocalAccount: bool,
  isManualAccount: bool,
  mustChangePassword: bool,
  passwordChangedAt: nullable(isoDate),
  active: bool,
});

export const setupRequired = object<SetupRequiredResponse>({ setupRequired: bool });

export const localAuthStatus = object<LocalAuthStatusResponse>({ enabled: bool });

export const localLogin = object<LocalLoginResponse>({ ok: literal(true), mustChangePassword: bool });
