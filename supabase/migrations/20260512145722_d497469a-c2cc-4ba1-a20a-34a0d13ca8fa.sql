
ALTER TABLE festival_accommodation
  ADD COLUMN IF NOT EXISTS room_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beds_per_room integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'DKK',
  ADD COLUMN IF NOT EXISTS confirmation_pdf_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_parsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parse_summary text;

CREATE TABLE IF NOT EXISTS festival_accommodation_room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES festival_accommodation(id) ON DELETE CASCADE,
  room_label text NOT NULL,
  bed_count integer NOT NULL DEFAULT 2,
  bed_1_assignee text,
  bed_2_assignee text,
  bed_3_assignee text,
  bed_4_assignee text,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_far_accommodation ON festival_accommodation_room(accommodation_id);
ALTER TABLE festival_accommodation_room ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select" ON festival_accommodation_room;
DROP POLICY IF EXISTS "auth_insert" ON festival_accommodation_room;
DROP POLICY IF EXISTS "auth_update" ON festival_accommodation_room;
DROP POLICY IF EXISTS "auth_delete" ON festival_accommodation_room;
CREATE POLICY "auth_select" ON festival_accommodation_room FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON festival_accommodation_room FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON festival_accommodation_room FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON festival_accommodation_room FOR DELETE TO authenticated USING (true);
