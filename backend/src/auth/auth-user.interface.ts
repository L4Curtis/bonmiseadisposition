import { UserRole } from '@prisma/client';

/** Shape of the user object attached to the request by JwtStrategy.validate() */
export interface AuthUser {
  id: string;
  samAccountName: string;
  displayName: string;
  email: string;
  department: string | null;
  company: string | null;
  title: string | null;
  filialeId: string | null;
  filiale: { id: string; name: string; displayName: string } | null;
  isItStaff: boolean;
  role: UserRole;
  isLocalAccount: boolean;
  mustChangePassword: boolean;
  active: boolean;
}
