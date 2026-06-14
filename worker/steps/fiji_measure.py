"""
Step: fiji_measure  (capability "fiji_measure")  — runs on the school box (has Fiji).

Runs Fiji/ImageJ fully headless to do the image-size / UV-map work for the pullbacks.
Headless invocation:

    ImageJ-win64.exe --headless --console --run macro.ijm "args"

The actual macro lives in worker/fiji/measure.ijm — drop your existing ImageJ macro /
pullback-UV steps there. This wrapper passes paths in and collects outputs.
"""
from __future__ import annotations
import os
import subprocess
from pathlib import Path


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    cfg = ctx["config"]
    p = job.get("params", {}) or {}

    fiji = cfg["tools"]["fiji"]
    macro = str(Path(__file__).resolve().parent.parent / "fiji" / "measure.ijm")
    in_path = p["input_path"]          # mesh / obj / image to process
    out_dir = p["out_dir"]
    os.makedirs(out_dir, exist_ok=True)

    # ImageJ macro args are a single string; we pass "key=val,key=val".
    macro_args = f"input={in_path},output={out_dir}"
    cmd = [fiji, "--headless", "--console", "--run", macro, macro_args]
    log("running headless Fiji: " + " ".join(cmd[:4]) + " …")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    log(proc.stdout[-2000:])
    if proc.returncode != 0:
        raise RuntimeError(f"Fiji failed (rc={proc.returncode})\n{proc.stderr[-4000:]}")

    outputs = [str(f) for f in Path(out_dir).glob("*") if f.is_file()]
    log(f"fiji done: {len(outputs)} outputs")
    return {"artifacts": [{"kind": "measurement", "path": o} for o in outputs]}
