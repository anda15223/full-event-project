create table if not exists public.setup_runs (
    id                  uuid primary key default gen_random_uuid(),
    festival_id         uuid not null,
    setup_date          date,
    soborg_meet_time    time,
    destination_address text,
    arrival_time        time,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table if not exists public.setup_phases (
    id                       uuid primary key default gen_random_uuid(),
    setup_run_id             uuid not null references public.setup_runs(id) on delete cascade,
    sort_order               integer not null default 0,
    phase_name               text not null,
    concept                  text check (concept in ('fish','gyros','creperie','chicks','all')),
    transport_allocation_id  uuid references public.festival_staff_vehicles(id) on delete set null,
    planned_time             time,
    notes                    text,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);
create index if not exists idx_setup_phases_run_order on public.setup_phases (setup_run_id, sort_order);

create table if not exists public.setup_attachments (
    id            uuid primary key default gen_random_uuid(),
    setup_run_id  uuid not null references public.setup_runs(id) on delete cascade,
    concept       text check (concept in ('fish','gyros','creperie','chicks','all')),
    file_path     text not null,
    file_name     text not null,
    mime_type     text,
    created_at    timestamptz not null default now()
);
create index if not exists idx_setup_attachments_run on public.setup_attachments (setup_run_id, concept);

alter table public.setup_runs        enable row level security;
alter table public.setup_phases      enable row level security;
alter table public.setup_attachments enable row level security;

create policy setup_runs_admin on public.setup_runs
    for all using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));
create policy setup_phases_admin on public.setup_phases
    for all using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));
create policy setup_attachments_admin on public.setup_attachments
    for all using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));