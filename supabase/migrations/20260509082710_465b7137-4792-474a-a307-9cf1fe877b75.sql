
DO $$ BEGIN
  CREATE TYPE public.contact_type AS ENUM ('festival_organizer','operator','internal','supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.festival_contacts
  ADD COLUMN IF NOT EXISTS contact_type public.contact_type NOT NULL DEFAULT 'festival_organizer',
  ADD COLUMN IF NOT EXISTS last_contact_date date;

CREATE OR REPLACE VIEW public.festival_contacts_aggregated AS
WITH base AS (
  SELECT
    fc.*,
    f.slug AS festival_slug,
    f.name AS festival_name,
    f.start_date AS festival_start,
    CASE
      WHEN fc.email IS NOT NULL AND length(trim(fc.email)) > 0
        THEN 'e:' || lower(trim(fc.email))
      ELSE 'n:' || lower(trim(fc.full_name)) || '|' || lower(trim(coalesce(fc.organization,'')))
    END AS dedup_key
  FROM public.festival_contacts fc
  LEFT JOIN public.festivals f ON f.id = fc.festival_id
)
SELECT
  dedup_key,
  (array_agg(full_name ORDER BY is_primary DESC, updated_at DESC))[1] AS canonical_name,
  (array_agg(email ORDER BY (email IS NULL), updated_at DESC))[1] AS email,
  (array_agg(phone ORDER BY (phone IS NULL), updated_at DESC))[1] AS phone,
  (array_agg(organization ORDER BY (organization IS NULL), updated_at DESC))[1] AS organization,
  (array_agg(role ORDER BY is_primary DESC, updated_at DESC))[1] AS role,
  (array_agg(contact_type ORDER BY is_primary DESC, updated_at DESC))[1] AS contact_type,
  count(*)::int AS festival_count,
  array_agg(DISTINCT festival_slug) FILTER (WHERE festival_slug IS NOT NULL) AS festival_slugs,
  array_agg(DISTINCT festival_name) FILTER (WHERE festival_name IS NOT NULL) AS festival_names,
  array_agg(DISTINCT festival_id) AS festival_ids,
  bool_or(is_primary) AS is_primary_at_any,
  string_agg(DISTINCT NULLIF(trim(notes),''), E'\n---\n') AS notes_combined
FROM base
GROUP BY dedup_key;

GRANT SELECT ON public.festival_contacts_aggregated TO authenticated, anon;
