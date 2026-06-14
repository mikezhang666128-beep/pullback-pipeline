"""
Step: ilastik_predict  (capability "ilastik_predict")  -- runs on the box.

Headless Ilastik batch prediction. Training the .ilp (drawing labels) stays manual in
the GUI; this automates the batch export AFTER a trained project exists (SOP step 10.e:
export "Probabilities Stage 2").

The classifier may be either a local path OR a `storage://<bucket>/<key>` reference
(uploaded through the web). Storage refs are downloaded to a temp file before running.

job.params:
    ilp_path        : trained .ilp -- local path OR storage://classifiers/<marker>/<file>.ilp
    input_glob      : downsampled .h5 file(s)
    output_dir      : where to write probability maps
    export_source   : default "Probabilities Stage 2"
"""
from __future__ import annotations
import glob
import os
import subprocess
import tempfile


def _resolve_ilp(ilp_path, ctx, log):
    """If ilp_path is a storage:// ref, download it and return a local path."""
    if not ilp_path.startswith("storage://"):
        return ilp_path
    bucket, _, key = ilp_path[len("storage://"):].partition("/")
    sb = ctx["supabase"]
    log(f"fetching classifier from storage: {bucket}/{key}")
    data = sb.storage.from_(bucket).download(key)
    local = os.path.join(tempfile.mkdtemp(prefix="ilp_"), os.path.basename(key))
    with open(local, "wb") as f:
        f.write(data)
    log(f"classifier -> {local} ({len(data)} bytes)")
    return local


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    cfg = ctx["config"]
    p = job.get("params", {}) or {}

    ilastik = cfg["tools"]["ilastik"]
    ilp = _resolve_ilp(p["ilp_path"], ctx, log)
    input_glob = p["input_glob"]
    output_dir = p["output_dir"]
    export_source = p.get("export_source", "Probabilities Stage 2")
    os.makedirs(output_dir, exist_ok=True)

    inputs = sorted(glob.glob(input_glob))
    if not inputs:
        raise FileNotFoundError(f"No inputs matched {input_glob}")
    log(f"ilastik headless: {len(inputs)} files -> '{export_source}'")

    cmd = [
        ilastik,
        "--headless",
        f"--project={ilp}",
        f"--export_source={export_source}",
        "--output_format=hdf5",
        f"--output_filename_format={output_dir}/{{nickname}}_Probabilities Stage 2.h5",
        "--input_axes=cxyz",
        *inputs,
    ]
    log("running: " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ilastik failed (rc={proc.returncode})\n{proc.stderr[-4000:]}")

    outputs = sorted(glob.glob(f"{output_dir}/*_Probabilities Stage 2.h5"))
    log(f"ilastik done: {len(outputs)} probability maps")
    return {"artifacts": [{"kind": "probabilities", "path": o} for o in outputs]}
