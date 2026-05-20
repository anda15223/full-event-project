-- Rollback for festival_concept_hours
DROP TABLE IF EXISTS public.festival_concept_hours CASCADE;
DROP FUNCTION IF EXISTS public.compute_hours_metrics() CASCADE;
