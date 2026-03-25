-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'contestation_resolution';
ALTER TYPE "NotificationType" ADD VALUE 'cancellation';
ALTER TYPE "NotificationType" ADD VALUE 'mark_found';

-- CreateIndex
CREATE INDEX "audit_logs_bon_id_created_at_idx" ON "audit_logs"("bon_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_email_action_created_at_idx" ON "audit_logs"("user_email", "action", "created_at");

-- CreateIndex
CREATE INDEX "bons_status_idx" ON "bons"("status");

-- CreateIndex
CREATE INDEX "bons_collaborateur_id_idx" ON "bons"("collaborateur_id");

-- CreateIndex
CREATE INDEX "bons_filiale_id_idx" ON "bons"("filiale_id");

-- CreateIndex
CREATE INDEX "notification_logs_bon_id_type_idx" ON "notification_logs"("bon_id", "type");

-- CreateIndex
CREATE INDEX "signatures_bon_id_type_signed_idx" ON "signatures"("bon_id", "type", "signed");
