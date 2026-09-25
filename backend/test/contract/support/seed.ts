/**
 * Jeu de données minimal des tests de contrat, recréé au début de chaque
 * fichier de test (base vidée puis remplie) : chaque fichier part du même
 * état, quel que soit l'ordre d'exécution et ce que les autres ont modifié.
 *
 * Contenu : une filiale active et une désactivée, un compte par rôle (plus un
 * second collaborateur, un compte créé à la main et un compte désactivé), un
 * catalogue avec un pack, et des bons dans chaque statut (voir seed-bons.ts).
 */
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { EMAILS, LOCAL_ADMIN_PASSWORD } from './fixtures';
import type { Persona, SessionUser } from './http';
import { SeededBons, seedBons } from './seed-bons';
import { seedOperations } from './seed-operations';

export interface SeededPerson extends SessionUser {
  displayName: string;
}

export type SeededPeople = Readonly<Record<Persona | 'manual' | 'departed', SeededPerson>>;

export interface SeededCatalog {
  laptopId: string;
  screenId: string;
  retiredId: string;
  packId: string;
}

export interface SeededData {
  filialeId: string;
  inactiveFilialeId: string;
  people: SeededPeople;
  catalog: SeededCatalog;
  bons: SeededBons;
}

/** Vide toutes les tables de l'application (pas l'historique des migrations). */
async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ') INTO tables
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' CASCADE';
      END IF;
    END $$;
  `);
}

interface PersonSpec {
  key: keyof SeededPeople;
  role: UserRole;
  email: string | null;
  displayName: string;
  extra?: Partial<Prisma.UserUncheckedCreateInput>;
}

async function createPerson(prisma: PrismaClient, filialeId: string, spec: PersonSpec): Promise<SeededPerson> {
  const user = await prisma.user.create({
    data: {
      samAccountName: `contrat.${spec.key}`,
      displayName: spec.displayName,
      email: spec.email,
      role: spec.role,
      isItStaff: spec.role === 'admin' || spec.role === 'technician',
      filialeId,
      department: 'Service contrat',
      ...spec.extra,
    },
  });
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}

async function seedPeople(prisma: PrismaClient, filialeId: string): Promise<SeededPeople> {
  const passwordHash = await bcrypt.hash(LOCAL_ADMIN_PASSWORD, 10);
  const specs: PersonSpec[] = [
    {
      key: 'admin', role: 'admin', email: EMAILS.admin, displayName: 'Alice Admin',
      extra: { isLocalAccount: true, passwordHash, passwordChangedAt: new Date() },
    },
    { key: 'technician', role: 'technician', email: EMAILS.technician, displayName: 'Thomas Technicien' },
    { key: 'direction', role: 'direction', email: EMAILS.direction, displayName: 'Diane Direction' },
    { key: 'collaborator', role: 'collaborator', email: EMAILS.collaborator, displayName: 'Camille Collaboratrice' },
    { key: 'otherCollaborator', role: 'collaborator', email: EMAILS.otherCollaborator, displayName: 'Olivier Autre' },
    { key: 'manual', role: 'collaborator', email: null, displayName: 'MARTIN Marc', extra: { isManualAccount: true } },
    { key: 'departed', role: 'collaborator', email: EMAILS.departed, displayName: 'Paul Parti', extra: { active: false } },
  ];
  const people = await Promise.all(specs.map((spec) => createPerson(prisma, filialeId, spec)));
  return Object.fromEntries(specs.map((spec, index) => [spec.key, people[index]])) as SeededPeople;
}

async function seedCatalog(prisma: PrismaClient): Promise<SeededCatalog> {
  const laptop = await prisma.equipmentCatalog.create({
    data: { category: 'pc_portable', brand: 'Dell', model: 'Latitude 5440', description: 'Portable 14 pouces' },
  });
  const screen = await prisma.equipmentCatalog.create({
    data: { category: 'ecran', brand: 'Dell', model: 'P2422H' },
  });
  const retired = await prisma.equipmentCatalog.create({
    data: { category: 'souris', brand: 'Logitech', model: 'M185', active: false },
  });
  const pack = await prisma.equipmentPack.create({
    data: {
      name: 'Poste standard',
      description: 'Portable et écran',
      items: {
        create: [
          { catalogItemId: laptop.id, quantity: 1, order: 0 },
          { catalogItemId: screen.id, quantity: 1, order: 1 },
        ],
      },
    },
  });
  return { laptopId: laptop.id, screenId: screen.id, retiredId: retired.id, packId: pack.id };
}

async function seedFiliales(prisma: PrismaClient): Promise<{ filialeId: string; inactiveFilialeId: string }> {
  const filiale = await prisma.filiale.create({
    data: {
      name: 'contrat-nord',
      displayName: 'Contrat Nord',
      address: '1 rue du Contrat, 59000 Lille',
      siret: '12345678900011',
    },
  });
  const inactive = await prisma.filiale.create({
    data: { name: 'contrat-sud', displayName: 'Contrat Sud', active: false },
  });
  return { filialeId: filiale.id, inactiveFilialeId: inactive.id };
}

/** Vide la base puis crée le jeu de données complet. */
export async function seedContractDatabase(prisma: PrismaClient): Promise<SeededData> {
  await resetDatabase(prisma);
  const { filialeId, inactiveFilialeId } = await seedFiliales(prisma);
  const people = await seedPeople(prisma, filialeId);
  const catalog = await seedCatalog(prisma);
  const bons = await seedBons(prisma, { filialeId, people, catalog });
  await seedOperations(prisma, { people, bons });
  return { filialeId, inactiveFilialeId, people, catalog, bons };
}
