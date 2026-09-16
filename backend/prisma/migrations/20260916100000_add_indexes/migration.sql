-- Index manquants sur les cles etrangeres et colonnes de tri/filtre frequent.
-- Prisma ne cree pas automatiquement d'index sur les colonnes de FK : sans
-- ces index, les jointures et comptages (ex. equipement.service#removeCatalogItem,
-- audit, filtres bons) degenerent en scan sequentiel a mesure que les tables
-- grossissent. Toutes les instructions sont IF NOT EXISTS pour rester
-- rejouables sur une base existante.

-- BonEquipment
CREATE INDEX IF NOT EXISTS "bon_equipments_bon_id_idx" ON "bon_equipments" ("bon_id");
CREATE INDEX IF NOT EXISTS "bon_equipments_catalog_item_id_idx" ON "bon_equipments" ("catalog_item_id");
CREATE INDEX IF NOT EXISTS "bon_equipments_serial_number_idx" ON "bon_equipments" ("serial_number");

-- Index fonctionnel : recherches/detections de conflits de numero de serie
-- insensibles a la casse (findSerialConflicts / getSerialHistory comparent
-- via lower()) sans cet index elles restent en scan sequentiel.
CREATE INDEX IF NOT EXISTS "bon_equipments_serial_lower_idx" ON "bon_equipments" (lower("serial_number"));

-- Contestation
CREATE INDEX IF NOT EXISTS "contestations_bon_id_idx" ON "contestations" ("bon_id");

-- User
CREATE INDEX IF NOT EXISTS "users_filiale_id_idx" ON "users" ("filiale_id");

-- EquipmentPackItem
CREATE INDEX IF NOT EXISTS "equipment_pack_items_pack_id_idx" ON "equipment_pack_items" ("pack_id");

-- Bon : tri chronologique (listes) et filtrage frequent statut + date de maj
CREATE INDEX IF NOT EXISTS "bons_created_at_idx" ON "bons" ("created_at");
CREATE INDEX IF NOT EXISTS "bons_status_updated_at_idx" ON "bons" ("status", "updated_at");

-- NotificationLog : file d'echecs / envois recents par statut
CREATE INDEX IF NOT EXISTS "notification_logs_status_sent_at_idx" ON "notification_logs" ("status", "sent_at");

-- Signature : signatures en attente proches de l'expiration (relances)
CREATE INDEX IF NOT EXISTS "signatures_signed_token_expires_at_idx" ON "signatures" ("signed", "token_expires_at");
