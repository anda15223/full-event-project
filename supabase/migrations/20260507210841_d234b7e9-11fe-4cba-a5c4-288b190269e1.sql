BEGIN;

CREATE TABLE IF NOT EXISTS season_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_label text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  reservation_number text NOT NULL,
  vehicle_type text NOT NULL,
  bilgruppe text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  monthly_renewal_day smallint,
  pickup_location text,
  return_location text,
  tariff_model text,
  monthly_rate_dkk numeric(10,2),
  daily_rate_dkk numeric(10,2),
  km_included_per_period smallint,
  km_overage_rate_dkk numeric(6,2),
  insurance_cdi boolean DEFAULT false,
  insurance_pai boolean DEFAULT false,
  insurance_glass boolean DEFAULT false,
  insurance_rsa boolean DEFAULT false,
  selvrisiko_dkk numeric(10,2),
  contracting_entity text NOT NULL,
  contracting_entity_cvr text,
  customer_number text,
  primary_driver_name text,
  notes text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','active','returned','cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_season_rentals_dates ON season_rentals (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_season_rentals_status ON season_rentals (status);

ALTER TABLE season_rentals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_users_all_access ON season_rentals;
CREATE POLICY auth_users_all_access ON season_rentals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS transport_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_id uuid NOT NULL REFERENCES festival_transport(id) ON DELETE CASCADE,
  leg_label text NOT NULL,
  leg_phase text NOT NULL
    CHECK (leg_phase IN (
      'setup_outbound','crew_outbound','festival_shuttle',
      'tour_city_move','pre_build','return_home','support'
    )),
  leg_date date NOT NULL,
  leg_start_time time,
  origin text,
  destination text,
  effective_capacity smallint,
  cargo_description text,
  notes text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','confirmed','completed','cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legs_transport ON transport_legs (transport_id);
CREATE INDEX IF NOT EXISTS idx_legs_date ON transport_legs (leg_date);
CREATE INDEX IF NOT EXISTS idx_legs_phase ON transport_legs (leg_phase);

ALTER TABLE transport_legs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_users_all_access ON transport_legs;
CREATE POLICY auth_users_all_access ON transport_legs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS transport_leg_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id uuid NOT NULL REFERENCES transport_legs(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES festival_staff(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'passenger'
    CHECK (role IN ('driver','passenger','co-driver')),
  seat_position text,
  pickup_point text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_staff_per_leg
  ON transport_leg_assignments (leg_id, staff_id)
  WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_driver_per_leg
  ON transport_leg_assignments (leg_id)
  WHERE role = 'driver';

CREATE INDEX IF NOT EXISTS idx_tla_leg ON transport_leg_assignments (leg_id);
CREATE INDEX IF NOT EXISTS idx_tla_staff ON transport_leg_assignments (staff_id)
  WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tla_role ON transport_leg_assignments (role);

ALTER TABLE transport_leg_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_users_all_access ON transport_leg_assignments;
CREATE POLICY auth_users_all_access ON transport_leg_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE festival_transport ADD COLUMN IF NOT EXISTS capacity smallint;
ALTER TABLE festival_transport ADD COLUMN IF NOT EXISTS season_rental_id uuid
  REFERENCES season_rentals(id) ON DELETE SET NULL;

COMMENT ON COLUMN festival_transport.capacity IS
  'Nominal max passengers including driver. Per-leg overrides live in transport_legs.effective_capacity.';
COMMENT ON COLUMN festival_transport.season_rental_id IS
  'If this transport row is one festival-window allocation of a longer season rental (Res 644/645), reference the parent season_rentals row.';

CREATE INDEX IF NOT EXISTS idx_ft_season_rental
  ON festival_transport (season_rental_id)
  WHERE season_rental_id IS NOT NULL;

ALTER TABLE festival_staff ADD COLUMN IF NOT EXISTS requires_transport boolean NOT NULL DEFAULT true;
ALTER TABLE festival_staff ADD COLUMN IF NOT EXISTS home_location text;

COMMENT ON COLUMN festival_staff.requires_transport IS
  'False for local-area hires who arrive on their own (e.g. 20 local Jelling staff).';
COMMENT ON COLUMN festival_staff.home_location IS
  'Free-text label used to group pickups (Søborg / Aarhus / Jelling local / etc.).';

CREATE INDEX IF NOT EXISTS idx_fs_requires_transport
  ON festival_staff (festival_id, requires_transport)
  WHERE requires_transport = true;

COMMIT;