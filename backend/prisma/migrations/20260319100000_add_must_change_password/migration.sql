-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Set must_change_password for existing local admin account
UPDATE "users" SET "must_change_password" = true WHERE "email" = 'admin@local' AND "is_local_account" = true;
