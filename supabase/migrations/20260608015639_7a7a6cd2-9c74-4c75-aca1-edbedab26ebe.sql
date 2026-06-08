ALTER TABLE public.fep_fidibus_buildout DROP CONSTRAINT IF EXISTS fep_fidibus_buildout_category_check;
ALTER TABLE public.fep_fidibus_buildout ADD CONSTRAINT fep_fidibus_buildout_category_check
  CHECK (category = ANY (ARRAY[
    'tent','power','water','gas','cooling','daka','tables','facade','other',
    'contacts','hours','equipment','trolleys','power_order','order_list','soborg','info_doc'
  ]::text[]));