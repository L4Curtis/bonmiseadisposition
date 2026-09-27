-- Documents probants : un document PDF par signature, jamais écrasé.
--
-- Jusqu'ici, `pdf_snapshots` ne gardait qu'une ligne par (bon, type) : une
-- seconde restitution, ou la remise signée de nouveau après une modification,
-- remplaçait le document précédent. La fiche et le portail perdaient la
-- première preuve, alors que l'audit gardait son empreinte.
--
-- Additive et rejouable (`IF NOT EXISTS` / `IF EXISTS`, contrainte posée dans
-- un bloc qui vérifie son absence). Les lignes existantes sont gardées telles
-- quelles, sans signature rattachée (`signature_id` NULL).

-- Rattachement du document à la signature dont il est la preuve.
ALTER TABLE "pdf_snapshots" ADD COLUMN IF NOT EXISTS "signature_id" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdf_snapshots_signature_id_fkey') THEN
    ALTER TABLE "pdf_snapshots"
      ADD CONSTRAINT "pdf_snapshots_signature_id_fkey" FOREIGN KEY ("signature_id")
      REFERENCES "signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- L'unicité par (bon, type) disparaît : plusieurs documents d'un même type
-- coexistent. L'unicité par (bon, type, signature) empêche seulement de
-- produire deux fois le document d'une même signature.
DROP INDEX IF EXISTS "pdf_snapshots_bon_id_type_key";

CREATE UNIQUE INDEX IF NOT EXISTS "pdf_snapshots_bon_id_type_signature_id_key"
  ON "pdf_snapshots"("bon_id", "type", "signature_id");

-- Version en vigueur d'un type (la plus récente) et liste chronologique.
CREATE INDEX IF NOT EXISTS "pdf_snapshots_bon_id_type_created_at_idx"
  ON "pdf_snapshots"("bon_id", "type", "created_at");
