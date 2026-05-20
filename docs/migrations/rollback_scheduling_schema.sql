-- Rollback for create_scheduling_schema migration. Kept on hand; not applied.
-- To apply: run via supabase--migration tool.

DROP TABLE IF EXISTS festival_schedule_shift CASCADE;
DROP TABLE IF EXISTS festival_schedule_position CASCADE;
DROP FUNCTION IF EXISTS compute_shift_metrics() CASCADE;
DROP FUNCTION IF EXISTS touch_updated_at() CASCADE;
