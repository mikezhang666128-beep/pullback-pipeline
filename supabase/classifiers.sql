-- ============================================================================
-- Classifier library — one curated, trained Ilastik .ilp per marker.
-- Train a marker once, reuse forever. The front-door looks up the active .ilp
-- for the chosen marker and feeds it to the ilastik_predict step.
-- Run this in the Supabase SQL editor (after schema.sql).
-- ============================================================================
create table if not exists classifiers (
  id          uuid primary key default uuid_generate_v4(),
  marker      text not null,                 -- e.g. 'tbx16', 'pMyo'
  ilp_path    text not null,                 -- trained .ilp on the shared drive
  channel     int  not null default 0,       -- which downsample channel feeds it (0=Ch0…)
  active      boolean not null default true, -- the version the front-door uses
  trained     boolean not null default true, -- false = placeholder / not yet trained
  notes       text,
  created_at  timestamptz default now()
);

-- one ACTIVE classifier per marker
create unique index if not exists classifiers_active_marker
  on classifiers (marker) where active;

-- Seed the two we have (paths in Mike's assigned crunch folder).
insert into classifiers (marker, ilp_path, channel, trained, notes) values
  ('pMyo',
   '/mnt/crunch/undergrads/stained_embryos/tbx16-GFP_pMyo-568/8hpf/202605211550/cropped/MyProject.ilp2.ilp',
   0, true,  'Trained pMyo classifier — proven headless (122M prob output).'),
  ('tbx16',
   '/mnt/crunch/undergrads/stained_embryos/tbx16-GFP_pMyo-568/8hpf/202605211550/cropped/MyProject.ilp',
   0, false, 'tbx16 .ilp is NOT fully trained yet — finish labeling in the Ilastik GUI.')
on conflict do nothing;

-- Read access (demo: anon + authenticated; tighten with real auth later).
alter table classifiers enable row level security;
do $$ begin
  create policy "read classifiers" on classifiers for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

-- Dashboard reads jobs/artifacts/runs with the anon key (demo). Idempotent.
do $$ begin
  create policy "read jobs anon"      on jobs      for select to anon using (true);
  create policy "read artifacts anon" on artifacts for select to anon using (true);
  create policy "read runs anon"      on runs      for select to anon using (true);
exception when duplicate_object then null; end $$;
