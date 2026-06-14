# Germ-Layer Pullback Pipeline — Hand-off (state as of 2026-06-14)

Owner: Mike (UCSB Streichan lab, undergrad, self-taught full-stack). New engineer — wants
detailed, step-by-step guidance and to discuss plans before building.
Repo: github.com/mikezhang666128-beep/pullback-pipeline (PUBLIC).
Local folder (OneDrive, do NOT run git from the sandbox here):
  C:\Users\19112\OneDrive\文档\Claude\Projects\Supersebastian666

---

## 1. What this is
Automates the lab's MuVi-SPIM germ-layer pipeline so people stop VNC-ing into machines and
clicking through Jupyter/Ilastik/Blender by hand. A web app: pick marker + stage, point it at a
raw embryo .tif on the shared `crunch` drive, click, and get a mesh `.obj` back. **It works and is
in use as a MESH GENERATOR.** The final pullback step is still done manually in Blender (see §6).

Full science pipeline (from the notebook): downsample Ch0 -> Ilastik mesoderm seg -> mesh from
probabilities (sigma=2, targetlen=1, isovalue=0.40) -> [align #12, TBD] -> Blender UV -> pullback
(create_cartographic_projections, uv_grid_steps=2048) -> MIP -> nuclei downsample -> displacement
field -> planar pullbacks. We automated **downsample -> Ilastik -> mesh** end-to-end.

## 2. Architecture (capability-routed job queue)
- **Web (Vercel, Next.js 14 app router)** = control panel. `web/`. Single page `web/app/page.tsx`.
- **Database/queue/auth/storage (Supabase, ref `zaanjvbrcjueowtnhoeb`)** = movies/jobs/runs/
  classifiers tables + email-password Auth + Storage buckets `meshes`(public) & `classifiers`(private).
- **Worker (Python) on lab box qbio-vip10** (`~/pullback-pipeline-main/worker/`) polls Supabase's
  `claim_job` RPC, runs the matching step headless, reads crunch files in place, writes to
  `~/mike_out/<user>/`, uploads results. SAME script everywhere; `capabilities` in config.toml decide
  what a box can run.

Flow: web -> insert run+jobs (blocked_by chain) -> worker claims queued job whose blocker is done ->
runs step -> records artifact + marks done -> unblocks next. Per-user via RLS (runs.created_by=auth.uid()).

## 3. Key files
- `web/app/page.tsx` — the whole UI (Login + App): run form, stage chips, collapsible/filterable
  classifier library (upload/swap/delete), live timer, auto-refresh, help panel, SVG icons.
- `web/app/api/runs/route.ts` — builds the job chain (downsample->ilastik->mesh[->pullback]),
  looks up classifier by marker+stage, sets created_by + per-user output dir, mode=mesh|pullback.
- `web/app/api/classifiers/route.ts` — POST upload .ilp to Storage + register; DELETE remove.
- `web/lib/supabaseClient.ts` — browser client (anon key + user session, RLS applies).
- `supabase/schema.sql` — movies, machines, runs, jobs, artifacts, claim_job RPC, enums.
- `supabase/classifiers.sql` — classifiers table seed (run the migration SQLs noted in §5).
- `worker/worker.py` — agent loop. `worker/steps/{downsample,ilastik_predict,mesh,pullback,
  noop_test}.py`. `worker/uv/spherical_uv.py` — pure-python UV (azimuthal/equirectangular).
- `worker/config.toml` — ON BOX ONLY, gitignored, has Supabase service_role key (SECRET).
- `docs/WORKER_RESET.md` — how anyone resets/redeploys the worker.
- `reference/zebrafish_processing_transcribed.py`, `reference/blender_uv_button_script.py` — lab code.

## 4. Status — what works / what doesn't
WORKS (validated on real 6hpf pMyo data): login, per-user runs, marker+stage classifier library
w/ upload, full raw->mesh chain from a web click, mesh download, live timer, auto-refresh.
DOES NOT YET: the automated **pullback** (projection doesn't match the lab's "octopus" — needs the
alignment step). No batch-over-timepoints (one file per run). No custom email domain.

## 5. Supabase migrations already applied (idempotent; safe to re-run)
- classifiers table + seed (pMyo->MyProject.ilp2.ilp trained, tbx16->MyProject.ilp untrained).
- `stage` column + unique active index on (marker, stage); seeds tagged '8hpf'.
- Storage buckets: `meshes`(public), `classifiers`(private).
- per-user RLS: runs.created_by uuid; policies "own runs/jobs/artifacts" (auth.uid()); classifiers
  readable by authenticated.
- AUTH config to set in dashboard: Site URL + Redirect URLs = the Vercel domain (fixes localhost
  email link). Optionally turn OFF "Confirm email" for instant signup.

## 6. THE #1 NEXT TASK — finish the automated pullback
The mesh is right; the pullback isn't. Reference = notebook **cell 03** (mesoderm): 
`create_cartographic_projections(image=FULL-RES .tif, mesh=<mesoderm>_mesh_remeshed_UV.obj [BLENDER UV],
resolution=(0.4092,)*3, normal_offsets=np.arange(-45,10,0.7088), uv_grid_steps=2048)`. (Ectoderm/planar
stages use offsets -2..3; do NOT use -5,5 for mesoderm — that was a wrong turn.)
Our pipeline matches cell 03 EXACTLY except the UV (theirs from Blender sphere+shrinkwrap).
- pullback.py accepts a ready-made `uv_mesh` param (skips our unwrap) — built for exactly this.
- spherical_uv.py supports projection=azimuthal(disk/CIRCLE, default)|equirectangular(square), +
  optional pole_axis. Azimuthal gives the right CIRCLE shape but not the exact octopus.
- Strong hypothesis: missing the **alignment/rotation** step (SOP #12, "code to be developed still")
  which sets the embryo's orientation/pole. `pole_axis` param is the hook.
PLAN: (a) have Mike make the lab's real Blender UV ONCE on his laptop, feed via `uv_mesh` with cell-03
params -> if it produces the octopus, our projection code is proven & isolates the UV; (b) then build
an alignment step (PCA/cap-axis or postdoc's definition) and tune the pure-python UV to match.
Open question for the postdoc: what defines the embryo's canonical alignment/orientation?

## 7. Operating it
USER: open the Vercel URL -> sign in -> pick marker + stage chip -> paste crunch path to raw .tif
(Timepoint auto-fills) -> Output "Mesh only" -> Generate mesh -> watch timer/pills -> Download .obj
-> open in Blender (a .obj is text; Notepad shows numbers — that's normal) -> UV+pullback in Blender.
ADMIN (worker): see docs/WORKER_RESET.md. Currently persistent via:
  `nohup ~/miniconda3/envs/mike_btc/bin/python -u worker.py --config config.toml > ~/worker.log 2>&1 &`
  Alive check: `pgrep -f worker.py`. Survives VPN/VNC logout; only a vip10 reboot stops it.

## 8. Gotchas / lessons (so we don't repeat)
- Worker config `capabilities` MUST include every step it runs (downsample,ilastik_predict,mesh,
  pullback,noop_test) or jobs sit `queued` forever.
- A RUNNING worker does NOT reload code after `git pull` — pkill + restart every time.
- Python buffers stdout to a file -> use `python -u` for live logs.
- Supabase ?download on a public URL forces a file download with a clean name (cross-origin <a download> ignored).
- The btc "UV map has self-intersections / flipped triangles -> use_fallback" warning is HARMLESS
  (auto-enabled). Don't chase it.
- Editing OneDrive files with the Edit tool can inject NUL bytes -> write via bash heredoc to the
  mount + verify (no \x00) + check bracket balance for TSX.
- Don't run git from the sandbox on the OneDrive folder; Mike pushes from his laptop, box pulls.
- Mike concatenates multiple commands on one terminal line -> always say "one line at a time".
- The black hole in the pMyo pullback = the postdoc's CROP artifact (present at mesh stage), not a bug.

## 9. Pending / nice-to-have
- Post the Slack message to the postdoc (drafted, get OK on vip10 + the alignment definition).
- In-browser 3D mesh preview (so nobody opens a .obj in Notepad).
- Batch over a whole movie (TP range -> template path).
- Save run duration as a DB field for cross-embryo comparison.
- Boot auto-start for the worker (survive reboots).
- Custom SMTP / branded auth emails (optional).

Related memories: [[project-pullback-pipeline]] (full detail), [[user-mike]], [[feedback-onedrive-git]].
