"""
Step: ilastik_predict  (capability "ilastik_predict")  — runs on the SCHOOL box.

Headless Ilastik batch prediction. Training the mesoderm.ilp (drawing labels) stays
manual in the GUI — this automates only the batch export AFTER a trained project exists.
Mirrors SOP step 10.e: export "Probabilities Stage 2".

job.params:
    ilp_path        : path to the trained mesoderm.ilp
    input_glob      : downsampled Ch0 .h5 files, e.g. ".../01_ds_data/TP*_Ch0.h5"
    output_dir      : where to write probability maps
    export_source   : default "Probabilities Stage 2" (Autocontext 2-stage)
"""
from __future__ import annotations
import glob
import os
import subprocess


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    cfg = ctx["config"]
    p = job.get("params", {}) or {}

    ilastik = cfg["tools"]["ilastik"]
    ilp = p["ilp_path"]
    input_glob = p["input_glob"]
    output_dir = p["output_dir"]
    export_source = p.get("export_source", "Probabilities Stage 2")
    os.makedirs(output_dir, exist_ok=True)

    inputs = sorted(glob.glob(input_glob))
    if not inputs:
        raise FileNotFoundError(f"No inputs matched {input_glob}")
    log(f"ilastik headless: {len(inputs)} files -> '{export_source}'")

    # Ilastik appends a suffix; "_Probabilities Stage 2" matches the SOP naming.
    cmd = [
        ilastik,
        "--headless",
        f"--project={ilp}",
        f"--export_source={export_source}",
        "--output_format=hdf5",
        f"--output_filename_format={output_dir}/{{nickname}}_Probabilities Stage 2.h5",
        # downsampled .h5 were loaded as cxyz in training; keep axes consistent
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
