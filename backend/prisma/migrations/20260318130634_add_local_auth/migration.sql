-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_local_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" TEXT;
