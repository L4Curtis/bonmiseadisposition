-- Recherche d'un matériel par numéro d'inventaire (page /materiel, recherche
-- globale) : jusqu'ici seul le numéro de série était indexé.
CREATE INDEX "bon_equipments_inventory_number_idx" ON "bon_equipments"("inventory_number");
