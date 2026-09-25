/**
 * Traces d'exploitation du jeu de données de contrat : contestations, emails
 * (envoyés et en échec), journal d'audit, export SMB en échec et dernières
 * exécutions des tâches planifiées. Sans elles, les listes correspondantes
 * seraient vides et leurs tests ne vérifieraient la forme d'aucun élément.
 */
import { PrismaClient } from '@prisma/client';
import { JOB_KEYS } from '../../../src/monitoring/job-registry';
import type { SeededBons } from './seed-bons';
import type { SeededPeople } from './seed';

interface OperationsContext {
  people: SeededPeople;
  bons: SeededBons;
}

async function seedContestations(prisma: PrismaClient, { people, bons }: OperationsContext): Promise<void> {
  await prisma.contestation.create({
    data: {
      bonId: bons.contested.id,
      userId: people.collaborator.id,
      message: "L'écran reçu n'est pas celui indiqué sur le bon.",
    },
  });
  await prisma.contestation.create({
    data: {
      bonId: bons.active.id,
      userId: people.collaborator.id,
      message: 'Le numéro de série du portable me semble faux.',
      status: 'rejected',
      resolvedById: people.technician.id,
      resolutionMessage: 'Numéro vérifié sur le matériel : il est correct.',
    },
  });
}

async function seedNotifications(prisma: PrismaClient, { people, bons }: OperationsContext): Promise<void> {
  await prisma.notificationLog.createMany({
    data: [
      { bonId: bons.sentMiseDispo.id, recipientEmail: people.collaborator.email ?? '', type: 'mise_dispo_request', status: 'sent' },
      { bonId: bons.active.id, recipientEmail: people.collaborator.email ?? '', type: 'confirmation', status: 'sent' },
      {
        bonId: bons.active.id, recipientEmail: people.collaborator.email ?? '', type: 'reminder', status: 'failed',
        errorMessage: 'Serveur SMTP injoignable', reminderNumber: 1,
      },
    ],
  });
}

async function seedAudit(prisma: PrismaClient, { people, bons }: OperationsContext): Promise<void> {
  await prisma.auditLog.createMany({
    data: [
      { bonId: bons.draft.id, userId: people.technician.id, userEmail: people.technician.email, action: 'bon_created', details: { reference: bons.draft.reference } },
      {
        bonId: bons.contested.id, userId: people.collaborator.id, userEmail: people.collaborator.email,
        action: 'bon_contested', details: { message: "L'écran reçu n'est pas celui indiqué.", previousStatus: 'sent_mise_dispo' },
      },
      { userEmail: people.admin.email, action: 'login_local_success', ipAddress: '10.0.0.1', userAgent: 'contrat' },
    ],
  });
}

async function seedExploitation(prisma: PrismaClient, { bons }: OperationsContext): Promise<void> {
  await prisma.smbExport.create({
    data: {
      bonId: bons.archived.id,
      filename: `${bons.archived.reference}.pdf`,
      status: 'failed',
      errorMessage: 'Partage réseau inaccessible',
      retryCount: 1,
      lastAttemptAt: new Date(),
    },
  });
  const finishedAt = new Date();
  await prisma.scheduledJobRun.createMany({
    data: [
      { job: JOB_KEYS.SIGNATURE_REMINDERS, lastStartedAt: finishedAt, lastFinishedAt: finishedAt, lastStatus: 'success', lastDurationMs: 120 },
      { job: JOB_KEYS.SMB_RETRY, lastStartedAt: finishedAt, lastFinishedAt: finishedAt, lastStatus: 'error', lastError: 'Partage réseau inaccessible', lastDurationMs: 40 },
    ],
  });
}

export async function seedOperations(prisma: PrismaClient, context: OperationsContext): Promise<void> {
  await seedContestations(prisma, context);
  await seedNotifications(prisma, context);
  await seedAudit(prisma, context);
  await seedExploitation(prisma, context);
}
