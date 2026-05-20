-- Rollback: remove display_name from festival_schedule_position
ALTER TABLE public.festival_schedule_position DROP COLUMN display_name;
