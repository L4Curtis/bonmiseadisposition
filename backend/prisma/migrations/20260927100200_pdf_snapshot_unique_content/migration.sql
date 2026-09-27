-- Documents probants : l'unicité porte aussi sur le contenu du document.
--
-- Une même signature IT peut être la preuve de deux documents différents :
-- le PV réémis sans nouvelle signature (un équipement retrouvé, puis la
-- restitution signée, laisse une perte), ou un second avenant. L'unicité
-- (bon, type, signature) gardait alors le premier et perdait le second.
-- L'unicité (bon, type, signature, empreinte) garde les deux ; elle
-- n'empêche que le doublon exact (double appel, régénération).
--
-- Additive et rejouable. Aucune ligne existante ne la viole : l'ancienne
-- unicité, plus stricte, était en place.
CREATE UNIQUE INDEX IF NOT EXISTS "pdf_snapshots_bon_id_type_signature_id_sha256_key"
  ON "pdf_snapshots"("bon_id", "type", "signature_id", "sha256");

DROP INDEX IF EXISTS "pdf_snapshots_bon_id_type_signature_id_key";
