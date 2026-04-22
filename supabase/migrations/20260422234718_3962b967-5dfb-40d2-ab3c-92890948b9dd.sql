-- Extend brain_entries to support festival-scoped knowledge with frequency learning

ALTER TABLE public.brain_entries
  ADD COLUMN IF NOT EXISTS festival_id uuid,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS last_seen_festival_id uuid,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS frequency integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confidence numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id text;

-- scope: 'global' | 'festival' | 'concept' | 'section'
-- subject_type: e.g. 'concept','section','equipment','contact','supplier','power_order' …
-- subject_id: free-form identifier (concept_id, section_key, supplier_name…)

CREATE INDEX IF NOT EXISTS idx_brain_entries_festival ON public.brain_entries(festival_id);
CREATE INDEX IF NOT EXISTS idx_brain_entries_scope ON public.brain_entries(scope);
CREATE INDEX IF NOT EXISTS idx_brain_entries_subject ON public.brain_entries(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_brain_entries_key ON public.brain_entries(key_name);

-- A reusable "smart card" storage table that lives in DB instead of jsonb on every concept.
-- This powers Equipment List, Cooling & Storage, Cooking Equipment, Safety, Setup Timeline,
-- Transportation, Fidibus, Power Requirements — all use the same primitive.
CREATE TABLE IF NOT EXISTS public.smart_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id uuid NOT NULL,
  concept_id uuid,             -- nullable: cards can be per-concept or per-festival
  card_key text NOT NULL,      -- e.g. 'equipment_list','cooling_storage','safety','setup_timeline','transportation','fidibus','cooking_equipment','power_requirements'
  title text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,  -- card-level fields (e.g. red flag state, totals)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_cards_festival_card ON public.smart_cards(festival_id, card_key);
CREATE INDEX IF NOT EXISTS idx_smart_cards_concept ON public.smart_cards(concept_id);

CREATE TABLE IF NOT EXISTS public.smart_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.smart_cards(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',     -- manual | upload | brain | ai
  source_file_id uuid,                       -- references smart_files
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_sections_card ON public.smart_sections(card_id, order_index);

CREATE TABLE IF NOT EXISTS public.smart_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.smart_sections(id) ON DELETE CASCADE,
  label text,
  value text,
  quantity text,
  notes text,
  status text,                              -- e.g. 'todo','done','blocked','ordered'
  owner text,
  due_date date,
  order_index integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',    -- manual | upload | brain | ai
  source_file_id uuid,
  ai_confidence numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_lines_section ON public.smart_lines(section_id, order_index);

CREATE TABLE IF NOT EXISTS public.smart_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.smart_cards(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  url text,
  filename text,
  mime_type text,
  size integer,
  extracted_text text,
  ai_summary text,
  parse_status text NOT NULL DEFAULT 'pending',  -- pending | processing | done | error
  parse_error text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_files_card ON public.smart_files(card_id);

-- Enable RLS - permissive for now (matches the rest of the project pattern)
ALTER TABLE public.smart_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smart_cards all" ON public.smart_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "smart_sections all" ON public.smart_sections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "smart_lines all" ON public.smart_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "smart_files all" ON public.smart_files FOR ALL USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER trg_smart_cards_updated BEFORE UPDATE ON public.smart_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_smart_sections_updated BEFORE UPDATE ON public.smart_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_smart_lines_updated BEFORE UPDATE ON public.smart_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();