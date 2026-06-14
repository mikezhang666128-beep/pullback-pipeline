"""
Step: pullback  (capability "pullback")

Final science step: mesh -> pullback image. Two sub-steps, BOTH pure-Python (no Blender):
  1. UV-map the mesh with a spherical unwrap (worker/uv/spherical_uv.py: sizes a sphere to
     the mesh's own bbox and assigns each vertex the sphere-point UV straight out from the
     centre -> _UV.obj). Replaces the manual Blender + Fiji sizing step.
  2. create_cartographic_projections(raw image, UV mesh) -> projected.tif  (the pullback).

Runs entirely in the blender_tissue_cartography Python env (same one mesh/downsample use).

job.params:
    mesh_obj     : the remeshed .obj from the mesh step
    raw_image    : full-res microscope .tif (the original fused crop)
    out_prefix   : output path prefix (writes <prefix>_UV.obj and <prefix>_projected.tif)
    normal_offsets   : [start, stop, step] for np.arange (default [-45, 10, 0.7088])
    uv_grid_steps    : default 2048
    resolution_in_microns : default (0.4092, 0.4092, 0.4092)
"""
from __future__ import annotations
import os
import sys
from pathlib import Path


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    p = job.get("params", {}) or {}

    mesh_obj = p["mesh_obj"]
    raw_image = p["raw_image"]
    out_prefix = p["out_prefix"]
    uv_obj = out_prefix + "_UV.obj"
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    # 1) UV unwrap -- pure-python spherical projection (no Blender)
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from uv.spherical_uv import unwrap
    log("UV unwrap (pure-python spherical) ...")
    unwrap(mesh_obj, uv_obj, log=log)

    # 2) cartographic projection -> pullback
    import numpy as np
    from blender_tissue_cartography import io as tcio
    from blender_tissue_cartography import interpolation as tcinterp

    resolution = tuple(p.get("resolution_in_microns", (0.4092, 0.4092, 0.4092)))
    no = p.get("normal_offsets", (-45, 10, 0.7088))
    normal_offsets = np.arange(*no)
    uv_grid_steps = int(p.get("uv_grid_steps", 2048))

    log("cartographic projection (uv_grid_steps=%d, offsets=%s) ..." % (uv_grid_steps, tuple(no)))
    projected_data, coords, normals = tcinterp.create_cartographic_projections(
        image=raw_image, mesh=uv_obj, resolution=resolution,
        normal_offsets=normal_offsets, uv_grid_steps=uv_grid_steps)
    projected_data[np.isnan(projected_data)] = 0

    out_tif = out_prefix + "_projected.tif"
    tcio.save_for_imageJ(out_tif, projected_data, z_axis=1)
    log("pullback written -> %s" % out_tif)

    return {"artifacts": [{"kind": "pullback", "path": out_tif},
                          {"kind": "uv_mesh", "path": uv_obj}]}
