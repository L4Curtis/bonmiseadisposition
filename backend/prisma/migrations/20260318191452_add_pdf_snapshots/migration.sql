/*
  Warnings:

  - You are about to drop the column `pdf_mise_dispo_path` on the `bons` table. All the data in the column will be lost.
  - You are about to drop the column `pdf_restitution_path` on the `bons` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bons" DROP COLUMN "pdf_mise_dispo_path",
DROP COLUMN "pdf_restitution_path",
ADD COLUMN     "pdf_mise_dispo_snapshot" BYTEA,
ADD COLUMN     "pdf_mise_dispo_snapshot_at" TIMESTAMP(3),
ADD COLUMN     "pdf_restitution_snapshot" BYTEA,
ADD COLUMN     "pdf_restitution_snapshot_at" TIMESTAMP(3);
