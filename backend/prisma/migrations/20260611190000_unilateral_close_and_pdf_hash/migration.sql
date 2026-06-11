-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'unilateral_closure';

-- AlterTable
ALTER TABLE "pdf_snapshots" ADD COLUMN "sha256" TEXT;
