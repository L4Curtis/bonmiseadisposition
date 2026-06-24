-- AlterTable: scellement probant + horodatage RFC 3161 optionnel des signatures
ALTER TABLE "signatures" ADD COLUMN "seal" TEXT;
ALTER TABLE "signatures" ADD COLUMN "sealed_at" TIMESTAMP(3);
ALTER TABLE "signatures" ADD COLUMN "ts_token" TEXT;
ALTER TABLE "signatures" ADD COLUMN "ts_authority" TEXT;
ALTER TABLE "signatures" ADD COLUMN "ts_at" TIMESTAMP(3);

-- AlterTable: horodatage d'anonymisation RGPD des bons
ALTER TABLE "bons" ADD COLUMN "anonymized_at" TIMESTAMP(3);

-- CreateTable: pièces jointes (binaire chiffré sur disque, métadonnées en base)
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "label" TEXT,
    "uploaded_by_id" TEXT,
    "uploaded_by_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_bon_id_created_at_idx" ON "attachments"("bon_id", "created_at");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
