-- AlterTable: traçage du mandataire en signature présentielle
ALTER TABLE "signatures" ADD COLUMN "signed_by_proxy" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: archive probante append-only (aucune preuve co-signée ne peut disparaître)
CREATE TABLE "proof_archives" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proof_archives_bon_id_created_at_idx" ON "proof_archives"("bon_id", "created_at");

-- AddForeignKey
ALTER TABLE "proof_archives" ADD CONSTRAINT "proof_archives_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
