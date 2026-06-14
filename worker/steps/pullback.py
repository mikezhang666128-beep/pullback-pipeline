"""
Step: pullback  (capability "pullback")  -- pure-Python projection, no Blender required.
  1. Get a UV-mapped mesh:
       - if param `uv_mesh` is given, use that .obj directly (e.g. a Blender-made
         `_mesh_remeshed_UV.obj`) -- skips our unwrap, for matching the lab exactly.
       - else UV-map `mesh_obj` ourselves (worker/uv/spherical_uv.py): azimuthal
         (disk) by default, or equirectangular (square). Optional pole_axis.
  2. create_cartographic_projections(raw image, UV mesh) -> projected.tif.

Matches notebook cell 03: image=full-res .tif, resolution=(0.4092,)*3, uv_grid_steps=2048,
normal_offsets=np.arange(-45,10,0.7088) for the MESODERM (ectoderm/planar stages use -2..3).

job.params:
    mesh_obj, raw_image, out_prefix
    uv_mesh           : optional -- a ready-made UV .obj (Blender). If set, skip our unwrap.
    projection        : 'azimuthal' (default) | 'equirectangular'   (only if we unwrap)
    pole_axis         : [x,y,z] optional
    normal_offsets    : [start, stop, step] for np.arange (default [-45,10,0.7088])
    uv_grid_steps     : default 2048
    resolution_in_microns : default (0.4092, 0.4092, 0.4092)
    use_fallback      : default True
"""
from __future__ import annotations
import os
import sys
import shutil
from pathlib import Path


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    p = job.get("params", {}) or {}

    raw_image = p["raw_image"]
    out_prefix = p["out_prefix"]
    uv_obj = out_prefix + "_UV.obj"
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    # 1) Obtain a UV mesh
    if p.get("uv_mesh"):
        # use a ready-made (e.g. Blender) UV mesh as-is
        src = p["uv_mesh"]
        log("using provided UV mesh: %s" % src)
        if os.path.abspath(src) != os.path.abspath(uv_obj):
            shutil.copyfile(src, uv_obj)
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from uv.spherical_uv import unwrap
        projection = p.get("projection", "azimuthal")
        pole_axis = p.get("pole_axis")
        log("UV unwrap (%s) ..." % projection)
        unwrap(p["mesh_obj"], uv_obj, log=log, projection=projection, pole_axis=pole_axis)

    # 2) cartographic projection -> pullback
    import numpy as np
    from blender_tissue_cartography import io as tcio
    from blender_tissue_cartography import interpolation as tcinterp

    resolution = tuple(p.get("resolution_in_microns", (0.4092, 0.4092, 0.4092)))
    no = p.get("normal_offsets", (-45, 10, 0.7088))
    normal_offsets = np.arange(*no)
    uv_grid_steps = int(p.get("uv_grid_steps", 2048))
    use_fallback = bool(p.get("use_fallback", True))

    log("cartographic projection (uv_grid_steps=%d, offsets=%s, use_fallback=%s) ..."
        % (uv_grid_steps, tuple(no), use_fallback))
    projected_data, coords, normals = tcinterp.create_cartographic_projections(
        image=raw_image, mesh=uv_obj, resolution=resolution,
        normal_offsets=normal_offsets, uv_grid_steps=uv_grid_steps,
        use_fallback=use_fallback)
    projected_data[np.isnan(projected_data)] = 0

    out_tif = out_prefix + "_projected.tif"
    tcio.save_for_imageJ(out_tif, projected_data, z_axis=1)
    log("pullback written -> %s" % out_tif)

    return {"artifacts": [{"kind": "pullback", "path": out_tif},
                          {"kind": "uv_mesh", "path": uv_obj}]}
