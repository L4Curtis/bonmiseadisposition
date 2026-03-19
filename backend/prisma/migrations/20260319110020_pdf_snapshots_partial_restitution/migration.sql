-- CreateEnum
CREATE TYPE "PdfSnapshotType" AS ENUM ('signature_it_mise_disposition', 'signature_collab_mise_disposition', 'signature_it_restitution', 'signature_collab_restitution', 'cloture_equipements_manquants');

-- AlterEnum
ALTER TYPE "BonStatus" ADD VALUE 'partially_returned';

-- AlterTable
ALTER TABLE "bon_equipments" ADD COLUMN     "not_returned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "not_returned_reason" TEXT,
ADD COLUMN     "returned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pdf_snapshots" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "type" "PdfSnapshotType" NOT NULL,
    "data" BYTEA NOT NULL,
    "filename" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pdf_snapshots_bon_id_type_key" ON "pdf_snapshots"("bon_id", "type");

-- AddForeignKey
ALTER TABLE "pdf_snapshots" ADD CONSTRAINT "pdf_snapshots_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
