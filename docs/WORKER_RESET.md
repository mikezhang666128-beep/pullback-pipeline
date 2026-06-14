# Resetting / restarting the worker (qbio-vip10)

The website + database live in the cloud. The **worker** is the program on the lab box
(qbio-vip10) that actually reads files off crunch and runs downsample → Ilastik → mesh.
If jobs on the website sit on **"queued" and never move**, the worker is the thing to reset.

Everything below is typed into **LXTerminal** on the box (the RealVNC desktop).
Run **one line at a time** — press Enter after each and wait for it to finish.

---

## 0. Key facts (so you know what you're touching)

- Repo on the box:   `~/pullback-pipeline-main`
- Python env:        `mike_btc`  (a clone of `blender_tissue_cartography`)
- Env's python:      `~/miniconda3/envs/mike_btc/bin/python`
- Config (secrets):  `~/pullback-pipeline-main/worker/config.toml`  (NOT in git — back it up!)
- Capabilities the worker must have: `noop_test, downsample, ilastik_predict, mesh, pullback`

---

## 1. Quick restart  (most common — worker stuck, or after a code update)

```bash
cd ~/pullback-pipeline-main
```
```bash
git pull origin main
```
```bash
pkill -f worker.py
```
```bash
cd worker && ~/miniconda3/envs/mike_btc/bin/python worker.py --config config.toml
```

You should see:
```
[school-vip10] registered  caps=['noop_test', 'downsample', 'ilastik_predict', 'mesh', 'pullback']
[school-vip10] polling every 5s …
```
If `caps` is missing `downsample` (or any step), the queue will stall — see Troubleshooting.

> Note: a running worker does NOT pick up code changes. After every `git pull` you must
> stop it (`pkill -f worker.py`) and start it again.

---

## 2. Make it permanent  (recommended — survives logout / terminal close / reboot)

Run the worker inside a **tmux** session so it keeps going after you close the window.

Start (or restart) it detached:
```bash
pkill -f worker.py
```
```bash
tmux kill-session -t worker 2>/dev/null; true
```
```bash
tmux new-session -d -s worker 'cd ~/pullback-pipeline-main/worker && ~/miniconda3/envs/mike_btc/bin/python worker.py --config config.toml'
```

Useful tmux commands:
- Watch it live:   `tmux attach -t worker`   (leave it running: press **Ctrl+B**, then **D**)
- Stop it:         `tmux kill-session -t worker`
- Is it running?   `tmux ls`

To auto-start on boot, you can add the `tmux new-session …` line to a startup script later.

---

## 3. Check it's alive

```bash
pgrep -f worker.py
```
- prints a number → running.   nothing → not running (start it, section 1 or 2).

```bash
tmux ls
```
- shows a `worker` session → the persistent worker is up.

Then trigger any small job from the website and watch the pills turn green.

---

## 4. Full rebuild  (fresh machine, or vip10 was wiped)

Do this on any computer that mounts **crunch** and has the `blender_tissue_cartography`
conda env. Nothing about the app is lost in a wipe except this local worker + scratch files.

**a) Get the code**
```bash
git clone https://github.com/mikezhang666128-beep/pullback-pipeline.git ~/pullback-pipeline-main
```

**b) Clone the python env (leaves the shared env untouched) + add the one extra package**
```bash
conda create -n mike_btc --clone blender_tissue_cartography -y
```
```bash
~/miniconda3/envs/mike_btc/bin/pip install supabase
```

**c) Recreate the config** (restore your backup if you have one; otherwise make it):
```bash
cat > ~/pullback-pipeline-main/worker/config.toml <<'EOF'
[supabase]
url = "https://zaanjvbrcjueowtnhoeb.supabase.co"
service_role_key = "PASTE_THE_LEGACY_SERVICE_ROLE_KEY_HERE"

[machine]
name = "school-vip10"
capabilities = ["noop_test", "downsample", "ilastik_predict", "mesh", "pullback"]

[tools]
ilastik = "/home/streichansuper/Downloads/ilastik-1.4.1.post1-Linux/run_ilastik.sh"
EOF
```
> Get the service_role key from your config.toml backup, or from Supabase →
> Project Settings → API → **Legacy** `service_role` key. Keep this secret.

**d) Start it** (use the tmux command in section 2). Done — it resumes claiming jobs.

---

## 5. Troubleshooting

- **Jobs stuck on `queued`** → the worker isn't running, OR its `capabilities` list is
  missing a step. Check: `grep -i capabilities ~/pullback-pipeline-main/worker/config.toml`
  must contain `downsample, ilastik_predict, mesh, pullback`. Fix + restart.
- **A step turns `failed`** → click the pill on the website (the error is in the tooltip),
  or read the worker output (`tmux attach -t worker`). Usually a wrong file path.
- **`config.toml` parse error** → it must be plain UTF-8 with no BOM. Recreate it with the
  `cat > … <<'EOF'` method above (not a Windows editor).
- **Code change didn't take effect** → you didn't restart after `git pull`. Stop + start.
