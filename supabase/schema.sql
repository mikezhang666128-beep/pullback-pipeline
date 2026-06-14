-- ============================================================================
-- Germ-Layer Pullback Pipeline — Supabase schema
-- Control plane: movie metadata + a capability-routed job queue + artifacts.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================
do $$ begin
  create type job_status as enum ('queued', 'blocked', 'running', 'done', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status as enum ('pending', 'running', 'done', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

-- Capabilities = the kinds of work a machine can do. Jobs require exactly one.
do $$ begin
  create type capability as enum (
    'downsample',       -- Jupyter/python downsample Ch0/Ch1 -> .h5
    'ilastik_predict',  -- headless Ilastik batch prediction (needs trained .ilp)
    'mesh',             -- generate meshes from probabilities
    'blender_pullback', -- Blender + blender_tissue_cartography UV pullbacks
    'fiji_measure'      -- ImageJ/Fiji headless image-size analysis
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- MOVIES  (synced from the "Zebrafish Movie Information" Google Sheet)
-- ============================================================================
create table if not exists movies (
  id            uuid primary key default uuid_generate_v4(),
  sheet_row_id  text unique,                 -- stable key from the Sheet for idempotent sync
  name          text not null,
  -- raw data locations (paths are resolved by the workers' storage backend)
  ch0_path      text,                        -- tbx16-eGFP (mesoderm)
  ch1_path      text,                        -- H2B-RFP (nuclear, whole embryo)
  working_dir   text,                        -- where 01_ds_data / 02_meshes / 03_pullbacks live
  ilp_path      text,                        -- trained mesoderm.ilp (set once training is done)
  -- timepoints (from the Sheet)
  t_start       int  default 0,
  t_end         int,
  t_step        int  default 1,
  -- meshing params (defaults from the SOP; per-movie overridable)
  sigma_smoothing numeric default 2,
  targetlen       numeric default 1,
  isovalue        numeric default 0.40,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================================
-- MACHINES  (the worker agents — one row per box, self-registered)
-- ============================================================================
create table if not exists machines (
  id            uuid primary key default uuid_generate_v4(),
  name          text unique not null,        -- e.g. 'school-ilastik', 'mike-blender', 'fiji-box'
  capabilities  capability[] not null default '{}',
  os            text,
  last_heartbeat timestamptz,
  online        boolean generated always as (false) stored, -- (UI computes from heartbeat instead)
  created_at    timestamptz default now()
);

-- ============================================================================
-- RUNS  (a "process this movie" envelope grouping its per-step jobs)
-- ============================================================================
create table if not exists runs (
  id          uuid primary key default uuid_generate_v4(),
  movie_id    uuid references movies(id) on delete cascade,
  status      run_status not null default 'pending',
  created_by  uuid,                          -- auth.uid()
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================================
-- JOBS  (THE QUEUE — capability-routed, dependency-aware)
-- ============================================================================
create table if not exists jobs (
  id           uuid primary key default uuid_generate_v4(),
  run_id       uuid references runs(id) on delete cascade,
  movie_id     uuid references movies(id) on delete cascade,
  step         text not null,                -- human label, e.g. 'downsample_ch0'
  capability   capability not null,          -- which worker can run it
  status       job_status not null default 'queued',
  blocked_by   uuid references jobs(id),     -- must be 'done' before this can run
  params       jsonb default '{}',           -- step inputs (paths, channel, timepoints…)
  result       jsonb default '{}',           -- step outputs (artifact paths…)
  logs         text default '',
  attempts     int default 0,
  claimed_by   uuid references machines(id),
  claimed_at   timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz default now()
);

create index if not exists jobs_queue_idx on jobs (status, capability);
create index if not exists jobs_run_idx   on jobs (run_id);

-- ============================================================================
-- ARTIFACTS  (outputs of each step so later steps + the UI can find them)
-- ============================================================================
create table if not exists artifacts (
  id          uuid primary key default uuid_generate_v4(),
  job_id      uuid references jobs(id) on delete cascade,
  movie_id    uuid references movies(id) on delete cascade,
  kind        text,                          -- 'ds_h5' | 'probabilities' | 'mesh' | 'pullback' | 'measurement'
  path        text,                          -- shared-drive path OR storage key
  meta        jsonb default '{}',
  created_at  timestamptz default now()
);

-- ============================================================================
-- claim_job() — atomic "give me the next runnable job for my capabilities"
-- Prevents two machines grabbing the same job. SKIP LOCKED = no contention.
-- ============================================================================
create or replace function claim_job(p_machine_id uuid, p_caps capability[])
returns jobs
language plpgsql
as $$
declare
  v_job jobs;
begin
  select * into v_job
  from jobs j
  where j.status = 'queued'
    and j.capability = any(p_caps)
    and (
      j.blocked_by is null
      or (select status from jobs b where b.id = j.blocked_by) = 'done'
    )
  order by j.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update jobs
     set status = 'running',
         claimed_by = p_machine_id,
         claimed_at = now(),
         started_at = now(),
         attempts = attempts + 1
   where id = v_job.id
   returning * into v_job;

  return v_job;
end;
$$;

-- Convenience: mark a job done + unblock dependents happens automatically via claim_job's
-- blocked_by check, so finishing is just an UPDATE the worker does directly.

-- ============================================================================
-- Row-Level Security (lab-wide access; tighten roles later)
-- ============================================================================
alter table movies    enable row level security;
alter table runs      enable row level security;
alter table jobs      enable row level security;
alter table artifacts enable row level security;
alter table machines  enable row level security;

-- Authenticated lab members can read everything.
do $$ begin
  create policy "lab read movies"    on movies    for select to authenticated using (true);
  create policy "lab read runs"      on runs      for select to authenticated using (true);
  create policy "lab read jobs"      on jobs      for select to authenticated using (true);
  create policy "lab read artifacts" on artifacts for select to authenticated using (true);
  create policy "lab read machines"  on machines  for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Authenticated lab members can create runs (trigger processing).
do $$ begin
  create policy "lab create runs" on runs for insert to authenticated with check (true);
  create policy "lab create jobs" on jobs for insert to authenticated with check (true);
exception when duplicate_object then null; end $$;

-- NOTE: workers connect with the SERVICE ROLE key (bypasses RLS) so they can
-- claim/update jobs and write artifacts. Keep that key only on the machines.
