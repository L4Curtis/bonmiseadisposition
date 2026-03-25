/**
 * User fixtures for unit and integration tests.
 *
 * Each fixture is a factory function that returns a fresh object to prevent
 * mutation leaking between tests. The shape matches the Prisma User model.
 */

/** Admin user — full access, IT staff. */
export function adminUser() {
  return {
    id: 'user-admin-001',
    samAccountName: 'admin.livio',
    displayName: 'Admin Livio',
    email: 'admin@groupelivio.fr',
    department: 'Direction Informatique',
    company: 'Groupe Livio',
    title: 'Responsable IT',
    role: 'admin' as const,
    isItStaff: true,
    isLocalAccount: false,
    active: true,
    filialeId: 'filiale-001',
    passwordHash: null as string | null,
    mustChangePassword: false,
    passwordChangedAt: null as Date | null,
    lastLdapSync: new Date('2026-03-25T06:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2026-03-25T06:00:00Z'),
  };
}

/** Technician user — IT staff with limited admin rights. */
export function technicianUser() {
  return {
    id: 'user-tech-001',
    samAccountName: 'marie.martin',
    displayName: 'Marie Martin',
    email: 'marie.martin@groupelivio.fr',
    department: 'Service Informatique',
    company: 'Groupe Livio',
    title: 'Technicienne IT',
    role: 'technician' as const,
    isItStaff: true,
    isLocalAccount: false,
    active: true,
    filialeId: 'filiale-001',
    passwordHash: null as string | null,
    mustChangePassword: false,
    passwordChangedAt: null as Date | null,
    lastLdapSync: new Date('2026-03-25T06:00:00Z'),
    createdAt: new Date('2025-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-25T06:00:00Z'),
  };
}

/** Collaborator user — standard employee receiving equipment. */
export function collaboratorUser() {
  return {
    id: 'user-collab-001',
    samAccountName: 'jean.dupont',
    displayName: 'Jean Dupont',
    email: 'jean.dupont@groupelivio.fr',
    department: 'Marketing',
    company: 'Groupe Livio',
    title: 'Chef de projet',
    role: 'collaborator' as const,
    isItStaff: false,
    isLocalAccount: false,
    active: true,
    filialeId: 'filiale-001',
    passwordHash: null as string | null,
    mustChangePassword: false,
    passwordChangedAt: null as Date | null,
    lastLdapSync: new Date('2026-03-25T06:00:00Z'),
    createdAt: new Date('2025-06-15T00:00:00Z'),
    updatedAt: new Date('2026-03-25T06:00:00Z'),
  };
}

/** Local admin user — created via setup wizard, not from LDAP. */
export function localAdminUser() {
  return {
    id: 'user-local-admin-001',
    samAccountName: 'local.admin',
    displayName: 'Administrateur Local',
    email: 'admin.local@groupelivio.fr',
    department: null as string | null,
    company: null as string | null,
    title: null as string | null,
    role: 'admin' as const,
    isItStaff: true,
    isLocalAccount: true,
    active: true,
    filialeId: null as string | null,
    passwordHash: '$2b$10$mockHashedPasswordForTesting',
    mustChangePassword: false,
    passwordChangedAt: new Date('2026-01-15T10:00:00Z'),
    lastLdapSync: null as Date | null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
  };
}
