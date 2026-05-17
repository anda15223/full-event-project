create table if not exists public.setup_phase_sources (
  id uuid primary key default gen_random_uuid(),
  setup_phase_id uuid not null references public.setup_phases(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  label text,
  detail text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists setup_phase_sources_phase_idx
  on public.setup_phase_sources(setup_phase_id);

alter table public.setup_phase_sources enable row level security;

create policy "setup_phase_sources_admin"
  on public.setup_phase_sources
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));