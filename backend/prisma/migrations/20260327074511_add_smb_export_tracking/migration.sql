-- CreateEnum
CREATE TYPE "SmbExportStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateTable
CREATE TABLE "smb_exports" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "SmbExportStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smb_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smb_exports_status_idx" ON "smb_exports"("status");

-- CreateIndex
CREATE INDEX "smb_exports_bon_id_idx" ON "smb_exports"("bon_id");

-- AddForeignKey
ALTER TABLE "smb_exports" ADD CONSTRAINT "smb_exports_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
