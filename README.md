# Germ-Layer Pullback Pipeline

A web app to run the MuVi SPIM zebrafish germ-layer pullback pipeline **from one browser**,
instead of logging into RealVNC and clicking through Ilastik / Fiji / Blender by hand on the
school computer and shuttling files between machines.

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first** — it explains the whole design in plain
terms (it's also the doc to show your professor).

---

## The idea in one paragraph

The school computer already has the code, the movie files, Ilastik, and Fiji. We install a
small **worker agent** on it that can run every pipeline step *headless* (no GUI). A
**Supabase** database holds the movie list and a **job queue**. A **Vercel** web page lets you
(and the lab) pick a movie and hit **Run** — that drops a chain of jobs in the queue, the
worker on the school box picks them up in order, and you watch progress live in the browser.
No VNC clicking, no copying files between two machines. The *only* thing still done by hand is
drawing Ilastik training labels (that's creative work and can't be automated).

```
Browser (you, anywhere)  ──►  Supabase queue  ◄──poll──  Worker on the school box
   pick movie, "Run"            jobs + status            runs downsample → ilastik →
   watch live status                                     mesh → fiji, all locally
```

---

## Repo layout

```
ARCHITECTURE.md          The design (start here / show the prof)
supabase/schema.sql      Database: movies, machines, jobs queue, artifacts, claim_job()
worker/                  The agent that runs on the school box
  worker.py                main loop: register, poll claim_job, run step, report
  storage.py               file-handoff abstraction (local/shared vs cloud)
  config.example.toml      per-machine config (copy to config.toml)
  bootstrap.ps1            installs the worker as an auto-starting Windows task
  steps/                   one runner per pipeline step
    downsample.py            headless "cell 3" — rebuilt from your SOP
    ilastik_predict.py       headless Ilastik batch prediction
    mesh.py                  mesh/.obj generation  (paste your code in the marked spot)
    blender_pullback.py      Blender pullback      (optional; for your laptop later)
    fiji_measure.py          headless Fiji         (paste your macro in fiji/measure.ijm)
  blender/make_pullback.py   Blender-python script (paste your Blender code here)
  fiji/measure.ijm           ImageJ macro (paste your macro here)
sheet_sync/sync.py       mirrors the "Zebrafish Movie Information" Sheet -> movies table
web/                     Next.js dashboard (deploy to Vercel)
  app/page.tsx             movie list + Run button + live job status
  app/api/runs/route.ts    builds the per-movie job chain
```

---

## Setup (one-time)

### 1. Supabase
1. Create a project at supabase.com.
2. SQL editor → paste & run `supabase/schema.sql`.
3. Authentication → enable Email logins, invite the lab (whole-lab access; RLS already set).
4. Grab from Project Settings → API: the **URL**, the **anon** key, the **service-role** key.

### 2. Worker on the school box
```powershell
cd worker
copy config.example.toml config.toml
# edit config.toml: Supabase url + service_role_key, machine name, capabilities, tool paths
powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1
```
Give this one box **all** capabilities so the whole chain runs locally:
`capabilities = ["downsample", "ilastik_predict", "mesh", "fiji_measure"]`.
Make sure the science libs your notebook uses (numpy, blender_tissue_cartography, igl,
pymeshlab, scikit-image, scipy, Pillow, tqdm) are importable by the worker's Python.

### 3. Google Sheet sync
```bash
cd sheet_sync
pip install -r requirements.txt
# set GOOGLE_SA_JSON, SHEET_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY  (see sync.py header)
python sync.py
```
Edit `COLUMN_MAP` in `sync.py` to match your real Sheet headers.

### 4. Dashboard on Vercel
```bash
cd web
npm install
cp .env.local.example .env.local   # fill in the three keys
npm run dev                         # http://localhost:3000
```
Deploy: push to GitHub, import the `web/` folder in Vercel, set the same three env vars.

---

## What's done vs. what needs YOUR code

**Done & runnable:** the queue, the worker loop + atomic job claiming, the **downsample** step
(faithfully rebuilt from your SOP, with the fixed base/mean/stdev/resolution/subsampling),
the **Ilastik headless** prediction command, the Sheet sync, and the dashboard.

**Drop your existing code into the marked `TODO(Mike)` spots:**
- `worker/steps/mesh.py` → `_generate_mesh()` — your meshing code (params σ=2, targetlen=1,
  iso=0.40 are passed in for you).
- `worker/fiji/measure.ijm` → your ImageJ macro for the UV map / pullback.
- `worker/blender/make_pullback.py` → your Blender code (only if you use Blender on your laptop).

I left these as clean stubs rather than guessing at code you already have.

---

## One decision still open

**Does the school box write all outputs to a folder it can also read back** (its own working
dir with `01_ds_data / 02_meshes / 03_pullbacks`)? For your single-machine setup the answer is
yes and there's nothing to configure beyond `shared_root` in `config.toml`. The cross-machine
file-handoff options only matter if you later split Blender onto your laptop — see
ARCHITECTURE.md §4.

---

## Roadmap

- **Phase 1** — prove `downsample` end-to-end: Run button → job → worker → `.h5` artifact.
- **Phase 2** — wire `ilastik_predict` reading the downsample output (first full handoff).
- **Phase 3** — mesh → fiji, dependencies all the way through.
- **Phase 4** — realtime polish, per-movie parameter editing in the UI, auth roles, retries,
  and the mesh **alignment** code (SOP step 12, "to be developed").
