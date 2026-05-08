ALTER TABLE festival_contracts DROP CONSTRAINT IF EXISTS festival_contracts_festival_id_concept_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS festival_contracts_festival_concept_alias_uniq
  ON festival_contracts (festival_id, concept_id, COALESCE(concept_alias, ''));