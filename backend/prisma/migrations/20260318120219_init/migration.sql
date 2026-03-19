-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'technician', 'collaborator');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('pc_portable', 'pc_fixe', 'ecran', 'souris', 'clavier', 'casque', 'telephone', 'housse', 'dock', 'cable', 'autre');

-- CreateEnum
CREATE TYPE "BonStatus" AS ENUM ('draft', 'sent_mise_dispo', 'signed_mise_dispo', 'active', 'sent_restitution', 'signed_restitution', 'archived', 'cancelled', 'contested');

-- CreateEnum
CREATE TYPE "Civilite" AS ENUM ('mme', 'mr');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('mise_disposition', 'restitution', 'it_cachet');

-- CreateEnum
CREATE TYPE "ContestationStatus" AS ENUM ('open', 'in_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('mise_dispo_request', 'restitution_request', 'reminder', 'confirmation', 'contestation_alert');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'failed', 'bounced');

-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filiales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "logo_path" TEXT,
    "stamp_path" TEXT,
    "address" TEXT,
    "siret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "sam_account_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "company" TEXT,
    "title" TEXT,
    "filiale_id" TEXT,
    "is_it_staff" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'collaborator',
    "last_ldap_sync" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_catalog" (
    "id" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_packs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_pack_items" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "catalog_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "equipment_pack_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bons" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "filiale_id" TEXT NOT NULL,
    "collaborateur_id" TEXT NOT NULL,
    "collaborateur_email" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "civilite" "Civilite" NOT NULL,
    "status" "BonStatus" NOT NULL DEFAULT 'draft',
    "date_mise_disposition" DATE NOT NULL,
    "date_restitution" DATE,
    "notes" TEXT,
    "pdf_mise_dispo_path" TEXT,
    "pdf_restitution_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bon_equipments" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "custom_label" TEXT,
    "serial_number" TEXT,
    "inventory_number" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bon_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "type" "SignatureType" NOT NULL,
    "token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signature_image_path" TEXT,
    "signed_at" TIMESTAMP(3),
    "signer_email" TEXT,
    "signer_ip" TEXT,
    "signer_user_agent" TEXT,
    "mention_lu_approuve" BOOLEAN NOT NULL DEFAULT false,
    "is_in_person" BOOLEAN NOT NULL DEFAULT false,
    "initiated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contestations" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContestationStatus" NOT NULL DEFAULT 'open',
    "resolved_by_id" TEXT,
    "resolution_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "NotificationStatus" NOT NULL,
    "error_message" TEXT,
    "reminder_number" INTEGER,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "bon_id" TEXT,
    "user_id" TEXT,
    "user_email" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_config_category_key_key" ON "app_config"("category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "users_sam_account_name_key" ON "users"("sam_account_name");

-- CreateIndex
CREATE UNIQUE INDEX "bons_reference_key" ON "bons"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_token_key" ON "signatures"("token");

-- AddForeignKey
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_filiale_id_fkey" FOREIGN KEY ("filiale_id") REFERENCES "filiales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pack_items" ADD CONSTRAINT "equipment_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "equipment_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_pack_items" ADD CONSTRAINT "equipment_pack_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "equipment_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_filiale_id_fkey" FOREIGN KEY ("filiale_id") REFERENCES "filiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bons" ADD CONSTRAINT "bons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_equipments" ADD CONSTRAINT "bon_equipments_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bon_equipments" ADD CONSTRAINT "bon_equipments_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "equipment_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contestations" ADD CONSTRAINT "contestations_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_bon_id_fkey" FOREIGN KEY ("bon_id") REFERENCES "bons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
