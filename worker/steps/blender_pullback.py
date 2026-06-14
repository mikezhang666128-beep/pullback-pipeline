"""
Step: blender_pullback  (capability "blender_pullback")  — runs on Mike's Blender box.

SOP steps 14-17: generate UV maps / surface pullbacks of the outer meshes via Blender
+ blender_tissue_cartography, then separate germ layers. Blender runs fully headless:

    blender --background --python make_pullback.py -- <args>

The actual pullback logic lives in worker/blender/make_pullback.py (a Blender-python
script) so it runs inside Blender's bundled Python where bpy + blender_tissue_cartography
are available. Drop your existing Blender code into that file.
"""
from __future__ import annotations
import json
import os
import subprocess
from pathlib import Path


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    cfg = ctx["config"]
    p = job.get("params", {}) or {}

    blender = cfg["tools"]["blender"]
    script = str(Path(__file__).resolve().parent.parent / "blender" / "make_pullback.py")
    mesh_obj = p["mesh_obj"]
    out_dir = p["out_dir"]
    os.makedirs(out_dir, exist_ok=True)

    args_json = json.dumps({
        "mesh_obj": mesh_obj,
        "out_dir": out_dir,
        "rotation": p.get("rotation"),       # from mesoderm alignment (SOP step 15)
        "layer": p.get("layer", "outer"),
    })

    cmd = [blender, "--background", "--python", script, "--", args_json]
    log("running headless Blender: " + " ".join(cmd[:4]) + " …")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    log(proc.stdout[-2000:])
    if proc.returncode != 0:
        raise RuntimeError(f"Blender failed (rc={proc.returncode})\n{proc.stderr[-4000:]}")

    pullbacks = [str(p) for p in Path(out_dir).glob("*.png")]
    log(f"pullback done: {len(pullbacks)} images")
    return {"artifacts": [{"kind": "pullback", "path": pb} for pb in pullbacks]}
