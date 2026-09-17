import { UnauthorizedException, ConflictException } from '@nestjs/common';

/** Thrown when an account is locked by brute-force protection — the controller
 *  logs it as login_local_locked (NOT login_local_failed) so that lockout
 *  attempts do not extend the lockout window indefinitely. */
export class AccountLockedException extends UnauthorizedException {}

/** Thrown when creating a new SSO-provisioned user hits a residual unique
 *  constraint violation — the controller redirects to a distinct error code
 *  (account_conflict) instead of the generic auth_failed (LOT C bug #4). */
export class AccountConflictException extends ConflictException {}
