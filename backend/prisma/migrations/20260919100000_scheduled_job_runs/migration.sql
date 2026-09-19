-- Suivi de la dernière exécution des tâches planifiées (lot A5, supervision).
-- Un seul enregistrement par tâche (clé "job"), réécrit à chaque exécution.

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('success', 'error', 'skipped');

-- CreateTable
CREATE TABLE "scheduled_job_runs" (
    "job" TEXT NOT NULL,
    "last_started_at" TIMESTAMP(3),
    "last_finished_at" TIMESTAMP(3),
    "last_status" "ScheduledJobStatus",
    "last_error" TEXT,
    "last_duration_ms" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("job")
);
