"""
Step: noop_test  (capability "noop_test")

A harmless mechanism test. Proves the worker can claim a job, report live progress,
and finish -- using ONLY the Python standard library (no numpy / blender_tissue_cartography
/ Ilastik). Once this flips a pill queued -> running -> done on the dashboard, we know the
whole worker loop works, and we move on to the real science steps.
"""
from __future__ import annotations
import time


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    p = job.get("params", {}) or {}
    seconds = int(p.get("seconds", 5))
    log("noop_test starting (step=%s)" % job.get("step"))
    for i in range(seconds):
        time.sleep(1)
        log("working... %d/%d" % (i + 1, seconds))
    log("noop_test finished OK")
    return {
        "summary": {"ok": True, "slept_seconds": seconds},
        "artifacts": [{"kind": "test", "path": "(no file - mechanism test)"}],
    }
