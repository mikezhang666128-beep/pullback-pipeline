"""
Step: mesh  (capability "mesh")  -- generate meshes from Ilastik probabilities.

Notebook section "02. Create meshes from probabilities".
Fixed meshing parameters (overridable per movie via job.params):
    sigma_smoothing = 2
    targetlen       = 1
    isovalue        = 0.40

The tail of the meshing code (largest-component + remesh) is the real code from
Mike's notebook photos. The TOP of section 02 (probability load -> gaussian smooth
-> marching cubes) was off-screen in the photos and still needs to be filled in.
See reference/zebrafish_processing_transcribed.py for the full transcription.
"""
from __future__ import annotations
import os


def _largest_component(mesh):
    """Keep the largest connected component (deletes 'blobs').
    From the notebook's split_connected_components() helper."""
    import igl
    import numpy as np
    from blender_tissue_cartography import mesh as tcmesh
    cc = igl.vertex_components(mesh.faces)
    values, counts = np.unique(cc, return_counts=True)
    comps = []
    for val in values:
        mask = cc == val
        verts = mesh.vertices[mask]
        faces = mesh.faces[(cc[mesh.faces] == val).all(axis=1)]
        relabel = -1 * np.ones(mesh.vertices.shape[0]).astype(int)
        relabel[mask] = np.arange(np.count_nonzero(mask))
        comps.append(tcmesh.ObjMesh(verts, relabel[faces]))
    comps = [x for _, x in sorted(zip(counts, comps), key=lambda p: p[0])][::-1]
    return comps[0]  # largest


def _generate_mesh(prob_h5, out_obj, *, sigma, targetlen, isovalue, log):
    from blender_tissue_cartography import remesh_pymeshlab as tcremesh_pymeshlab

    # MISSING FROM PHOTOS: the top of notebook section 02 was off-screen, i.e.
    # loading the probability volume, gaussian smoothing with sigma, and the
    # marching cubes at isovalue that produce the initial mesh. Slots in here:
    #
    #   prob = tcio.read_h5(prob_h5)[...]              # load probability channel
    #   smoothed = gaussian_filter(prob, sigma=sigma)  # SOP sigma=2
    #   mesh = <marching cubes on smoothed at isovalue>  # SOP iso=0.40
    #
    # The code BELOW is the real tail you showed in the photos.
    raise NotImplementedError(
        "Need the top of notebook section 02 (probability load, gaussian smooth, "
        "marching cubes). Tail is ready. sigma=%s targetlen=%s iso=%s"
        % (sigma, targetlen, isovalue)
    )
    # --- real code from the photo (runs once mesh exists above) ---------------
    mesh_selected = _largest_component(mesh)  # noqa: F821
    remeshed = tcremesh_pymeshlab.remesh_pymeshlab(mesh_selected, targetlen=targetlen)
    remeshed.write_obj(out_obj)  # notebook names it "<stem>_mesh_remeshed.obj"


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    p = job.get("params", {}) or {}
    prob_h5 = p["prob_h5"]
    out_obj = p["out_obj"]
    sigma = float(p.get("sigma_smoothing", 2))
    targetlen = float(p.get("targetlen", 1))
    isovalue = float(p.get("isovalue", 0.40))
    os.makedirs(os.path.dirname(out_obj), exist_ok=True)

    log("mesh: %s (sigma=%s, targetlen=%s, iso=%s)" % (prob_h5, sigma, targetlen, isovalue))
    _generate_mesh(prob_h5, out_obj, sigma=sigma, targetlen=targetlen,
                   isovalue=isovalue, log=log)
    log("mesh -> %s" % out_obj)
    return {"artifacts": [{"kind": "mesh", "path": out_obj,
                          "meta": {"sigma": sigma, "targetlen": targetlen, "isovalue": isovalue}}]}
