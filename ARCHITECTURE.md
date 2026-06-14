# Germ-Layer Pullback Pipeline — Architecture

Automating the MuVi SPIM zebrafish germ-layer pullback workflow across three machines,
with a web control plane the whole lab can use.

---

## 1. The core problem

Today Mike works across **two machines** and shuttles files between them by hand:

1. From his **own computer**, log into **RealVNC** to reach the **school computer**, which
   holds the **code, the movie files, Ilastik, and Fiji**.
2. On the school box: downsample → train/predict in **Ilastik** (`.h5`) → generate the `.obj`.
3. Pull the `.obj` back to his **own computer**, then use **Fiji** to produce the **UV map /
   pullback** for the zebrafish embryos.

The pain: constant VNC round-trips, manual clicking through each GUI, and copying files
between the two machines. **The goal: do it all from one web app, on one machine.**

The key realization is that the heavy tools and the data already live together on the
**school computer**. So we don't shuttle files at all — we **consolidate the compute there**
and put a thin web app on top. Mike (and the lab) drive everything from a browser on *any*
machine; the school box does the work locally and never hands files to a second computer.

You cannot "move this to the cloud" — the images are large and Ilastik/Fiji need real
GPU/RAM and live where they live. So the cloud's job is **not compute**, it's
**coordination**: a *control plane* (Supabase + Vercel) over a *worker* on the school box.

| Step group | Tool | Where it runs |
|---|---|---|
| Downsample Ch0/Ch1 → `.h5` | Jupyter / Python | **School box** (worker) |
| Segment mesoderm | **Ilastik** | **School box** (worker, headless predict) |
| Generate mesh / `.obj` | meshing code | **School box** (worker) |
| UV map / pullback | **Fiji / ImageJ** (and/or Blender) | **School box** (worker, headless) |

Everything lands on **one worker, one machine**. The architecture below still supports
*splitting* across machines later (Blender on your laptop, a second GPU box, etc.) by handing
that capability to another worker — but that's optional, not required to ship.

---

## 2. The pattern: a capability-routed job queue

```
                     ┌─────────────────────────────┐
                     │        CONTROL PLANE         │
                     │                              │
  Google Sheet ─sync→│  Supabase                    │
 (movie list)        │   • movies   • machines      │←──── Vercel dashboard
                     │   • jobs (queue) • runs      │      (lab logs in,
                     │   • artifacts                │       triggers runs,
                     │   claim_job() RPC            │       watches status)
                     └───────────────┬──────────────┘
                                     │ poll for jobs matching my capabilities
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
   ┌────────▼────────┐      ┌────────▼────────┐      ┌────────▼────────┐
   │  WORKER: school │      │  WORKER: mike   │      │  WORKER: fiji   │
   │  caps:          │      │  caps:          │      │  caps:          │
   │   downsample    │      │   mesh          │      │   fiji_measure  │
   │   ilastik       │      │   blender_pull  │      │                 │
   └─────────────────┘      └─────────────────┘      └─────────────────┘
   the same small Python agent runs on each box; only its capability list differs
```

> **Your case = one worker, all capabilities.** Install the agent once on the school box and
> give it every capability (`downsample, ilastik_predict, mesh, fiji_measure`). The whole
> chain runs there with **no file shuttling**. The queue/capability machinery costs nothing
> extra now and means that the day you want Blender on your own laptop, you just start a second
> worker with `blender_pullback` — no rewrite.

**How it works**
1. A movie needs processing. The dashboard (or an API call) creates a chain of **jobs** in
   Supabase — one row per pipeline step — each tagged with the **capability** it requires
   (e.g. `ilastik_predict`) and `blocked_by` the previous step.
2. Each machine runs the **same worker agent**. On startup it registers itself and the list
   of capabilities it has (set in its config). It then polls Supabase: *"give me the next
   queued job whose capability is in my list and whose dependencies are done."*
3. The worker claims the job atomically (via the `claim_job` RPC so two machines never grab
   the same one), runs the step **headless**, streams logs/status back, writes output
   artifacts to the shared location, and marks the job `done`. That unblocks the next job,
   which a (possibly different) machine picks up.

This is the whole trick: **one queue, many specialized workers, dependencies between steps.**
Adding a fourth machine later = install the agent, give it a capability. Nothing else changes.

---

## 3. What becomes headless (kills the VNC clicking)

Most steps have a no-GUI mode. This is where the time savings come from:

| Step | Manual today | Automated |
|---|---|---|
| Downsample Ch0/Ch1 | Run Jupyter cell 3 by hand, edit paths | `python steps/downsample.py` with params from the DB |
| Ilastik **training** | Draw labels in GUI | **Stays manual** — done once per `.ilp`, inherently human |
| Ilastik **prediction** | Batch-export in GUI | `ilastik --headless --project=mesoderm.ilp --export_source="Probabilities Stage 2" ...` |
| Mesh generation | Run code | `blender_tissue_cartography` meshing with fixed params (σ=2, targetlen=1, iso=0.40) |
| Pullback generation | Blender GUI | `blender --background --python make_pullback.py` |
| Fiji image sizing | ImageJ GUI | `ImageJ --headless --run macro.ijm` |

**The honest boundary:** Ilastik *label drawing* is creative human work and stays in the GUI.
Everything **downstream of a trained `.ilp`** automates. The app's job is to make training the
*only* thing you ever open a GUI for.

---

## 4. File handoff between machines  ← key open decision

**In your consolidated setup this is a non-issue:** every step runs on the school box, so the
output of one step is just a local path the next step reads — set `storage.backend = "shared"`
with `shared_root` pointing at the school box's working dir (where `01_ds_data / 02_meshes /
03_pullbacks` already live). The options below only matter *if/when* you split across machines.

Output of one step is input to the next; if steps run on different machines, three options
in order of recommendation:

1. **Shared network drive** (recommended if one exists). All three machines mount the same
   path (e.g. a lab NAS / SMB share / the school's network storage). Workers read/write there;
   Supabase only stores *paths*, never the big files. Simplest and fastest for large `.h5`.
2. **Supabase Storage / S3 as a relay.** Worker uploads the artifact, next worker downloads it.
   Works anywhere, but moving multi-GB SPIM data through cloud storage is slow and may cost.
   Good fallback for small artifacts (meshes, probability maps) even if raw images stay local.
3. **Direct sync (rsync/robocopy)** between machines on a schedule. Brittle; last resort.

We design the worker with a `storage` abstraction so this choice is **one config switch**,
not a rewrite. **Decision needed from you:** is there a shared drive all three machines can see?

---

## 5. Tech stack

- **Supabase** — Postgres (the queue + metadata), Auth (lab logins, row-level security),
  Realtime (dashboard live updates), optional Storage (artifact relay).
- **Vercel + Next.js** — the dashboard. Server components read Supabase; a couple of API
  routes create job chains. Realtime subscription shows job status live.
- **Worker agent** — plain Python (stdlib + `supabase` + `requests`), runs anywhere Python
  runs. Installed as a Windows service via PowerShell, or a Linux systemd unit.
- **Google Sheet sync** — a small script/cron that mirrors *Zebrafish Movie Information* into
  the `movies` table so the prof keeps her current habit.

---

## 6. Data model (summary — see `supabase/schema.sql`)

- **movies** — one row per zebrafish movie: paths, channels, `t_start`/`t_end`, mesh params,
  synced from the Sheet.
- **machines** — registered workers + their capabilities + last heartbeat.
- **jobs** — the queue. `(movie_id, step, capability, status, blocked_by, params, claimed_by,
  logs)`. Status: `queued → running → done | failed`.
- **runs** — a "process this whole movie" envelope grouping the per-step jobs.
- **artifacts** — outputs of each step (path or storage key + metadata) so later steps and the
  UI can find them.

---

## 7. Phased roadmap

- **Phase 0 (this scaffold).** Repo, schema, worker skeleton with real headless commands,
  dashboard starter, sheet sync.
- **Phase 1 — prove one machine.** Get `downsample` running end-to-end from a dashboard
  button → DB job → worker → artifact. This is the "it actually works" moment.
- **Phase 2 — the handoff.** Wire `ilastik_predict` on the school box reading the downsample
  output. First cross-machine chain.
- **Phase 3 — full chain.** Mesh → pullback → fiji, dependencies all the way through.
- **Phase 4 — polish.** Realtime status, per-movie parameter editing, auth/roles, error retry,
  the alignment code (PDF step 12, currently "to be developed").

---

## 8. Why this shocks the prof

Today: log into VNC, click through Jupyter, click through Ilastik, switch machines, open
Blender, switch again, open Fiji — per movie, for dozens of timepoints. After this: open one
web page, pick a movie, click **Run**, and watch the three machines hand work off to each
other automatically. The only thing a human still does is draw Ilastik training labels once.
