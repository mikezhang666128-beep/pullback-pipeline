"""
Step runner registry. Maps a job capability -> a function(job, ctx) -> result dict.

Each runner receives:
  job  : the jobs row (dict) — has movie_id, step, params, etc.
  ctx  : {"config": cfg, "log": fn(msg), "supabase": client}

and returns a result dict, optionally with:
  {"artifacts": [{"kind": "ds_h5", "path": "...", "meta": {...}}, ...]}
"""
from .downsample import run as _downsample
from .ilastik_predict import run as _ilastik_predict
from .mesh import run as _mesh
from .blender_pullback import run as _blender_pullback
from .fiji_measure import run as _fiji_measure

RUNNERS = {
    "downsample": _downsample,
    "ilastik_predict": _ilastik_predict,
    "mesh": _mesh,
    "blender_pullback": _blender_pullback,
    "fiji_measure": _fiji_measure,
}
