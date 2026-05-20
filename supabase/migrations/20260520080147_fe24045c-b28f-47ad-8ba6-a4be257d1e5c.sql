CREATE TABLE festival_schedule_position (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id     uuid NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  concept_id      uuid NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
  station_id      uuid NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
  position_number int  NOT NULL DEFAULT 1 CHECK (position_number >= 1),
  display_order   int  NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, concept_id, station_id, position_number)
);
CREATE INDEX idx_fsp_festival ON festival_schedule_position(festival_id);
CREATE INDEX idx_fsp_festival_concept ON festival_schedule_position(festival_id, concept_id);

CREATE TABLE festival_schedule_shift (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_position_id uuid NOT NULL REFERENCES festival_schedule_position(id) ON DELETE CASCADE,
  shift_date           date NOT NULL,
  festival_staff_id    uuid NOT NULL REFERENCES festival_staff(id) ON DELETE CASCADE,
  start_time           time NOT NULL,
  end_time             time NOT NULL,
  crosses_midnight     bool NOT NULL DEFAULT false,
  computed_hours       numeric(5,2),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fss_position ON festival_schedule_shift(schedule_position_id);
CREATE INDEX idx_fss_position_date ON festival_schedule_shift(schedule_position_id, shift_date);
CREATE INDEX idx_fss_staff ON festival_schedule_shift(festival_staff_id);

CREATE OR REPLACE FUNCTION compute_shift_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  start_min int;
  end_min   int;
  diff_min  int;
BEGIN
  start_min := EXTRACT(HOUR FROM NEW.start_time) * 60 + EXTRACT(MINUTE FROM NEW.start_time);
  end_min   := EXTRACT(HOUR FROM NEW.end_time)   * 60 + EXTRACT(MINUTE FROM NEW.end_time);
  IF start_min = end_min THEN
    NEW.crosses_midnight := false;
    diff_min := 0;
  ELSIF end_min < start_min THEN
    NEW.crosses_midnight := true;
    diff_min := (1440 - start_min) + end_min;
  ELSE
    NEW.crosses_midnight := false;
    diff_min := end_min - start_min;
  END IF;
  NEW.computed_hours := ROUND(diff_min::numeric / 60, 2);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_shift_metrics
  BEFORE INSERT OR UPDATE OF start_time, end_time
  ON festival_schedule_shift
  FOR EACH ROW
  EXECUTE FUNCTION compute_shift_metrics();

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_fsp_updated_at
  BEFORE UPDATE ON festival_schedule_position
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

ALTER TABLE festival_schedule_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_schedule_shift    ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_position_auth_all
  ON festival_schedule_position
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY schedule_shift_auth_all
  ON festival_schedule_shift
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);