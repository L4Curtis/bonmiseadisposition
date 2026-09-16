-- Index requis par le module KPI (tableau de bord) : agrégats par période sur
-- les signatures (délais), l'archivage et la restitution des bons (parc), les
-- retours d'équipement, les contestations et les journaux d'audit/notification
-- (incidents). Toutes les instructions sont IF NOT EXISTS pour rester
-- rejouables sur une base existante. Noms alignés sur la convention Prisma
-- (@@index correspondants dans schema.prisma) pour éviter tout drift détecté
-- par `prisma migrate diff`.

-- Signature : délais création→signature, envoi→signature (percentiles par période)
CREATE INDEX IF NOT EXISTS "signatures_signed_at_idx" ON "signatures" ("signed_at");
CREATE INDEX IF NOT EXISTS "signatures_created_at_idx" ON "signatures" ("created_at");

-- Bon : archivage sur une période (KPI + /bons/stats.archivedThisMonth), retards de restitution
CREATE INDEX IF NOT EXISTS "bons_archived_at_idx" ON "bons" ("archived_at");
CREATE INDEX IF NOT EXISTS "bons_date_restitution_idx" ON "bons" ("date_restitution");

-- BonEquipment : équipements rendus sur une période
CREATE INDEX IF NOT EXISTS "bon_equipments_returned_at_idx" ON "bon_equipments" ("returned_at");

-- Contestation : ouvertes/clôturées sur une période, délai de résolution
CREATE INDEX IF NOT EXISTS "contestations_created_at_idx" ON "contestations" ("created_at");
CREATE INDEX IF NOT EXISTS "contestations_status_updated_at_idx" ON "contestations" ("status", "updated_at");

-- AuditLog : compteurs par action sur une période (non-rendus, PV, clôtures unilatérales, annulations)
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs" ("action", "created_at");

-- NotificationLog : rappels par rang et emails en échec sur une période
CREATE INDEX IF NOT EXISTS "notification_logs_type_sent_at_idx" ON "notification_logs" ("type", "sent_at");
