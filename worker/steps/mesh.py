"""
Step: mesh  (capability "mesh")  -- generate a remeshed .obj from Ilastik probabilities.

This is the REAL code from notebook section "02. Create meshes from probabilities".
Fixed params (overridable per movie via job.params):
    sigma_smoothing = 2     (mesh smoothing, microns)
    targetlen       = 1     (remesh target edge length)
    isovalue        = 0.40
"""
from __future__ import annotations
import os


def _largest_component(mesh):
    """split_connected_components(mesh)[0] -- keep the largest, deletes 'blobs'."""
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


def _generate_mesh(prob_h5, out_obj, *, sigma, targetlen, isovalue,
                   resolution, subsampling, log):
    import numpy as np
    from blender_tissue_cartography import io as tcio
    from blender_tissue_cartography import mesh as tcmesh
    from blender_tissue_cartography import remesh as tcremesh
    from blender_tissue_cartography import remesh_pymeshlab as tcremesh_pymeshlab

    log("reading probabilities: %s" % prob_h5)
    segmentation = tcio.read_h5(prob_h5)[0]

    log("marching cubes (iso=%s, sigma_smoothing=%s)" % (isovalue, sigma))
    vertices, faces = tcremesh.marching_cubes(
        segmentation, isovalue=isovalue, sigma_smoothing=sigma)

    # rescale vertex coords into microns (downsampled voxels -> microns)
    vertices_in_microns = vertices * (np.array(resolution) / np.array(subsampling))
    mesh = tcmesh.ObjMesh(vertices_in_microns, faces)

    log("keeping largest connected component")
    mesh_selected = _largest_component(mesh)

    log("remeshing (targetlen=%s)" % targetlen)
    mesh_remeshed = tcremesh_pymeshlab.remesh_pymeshlab(mesh_selected, targetlen=targetlen)

    mesh_remeshed.write_obj(out_obj)
    log("mesh written -> %s" % out_obj)


def run(job: dict, ctx: dict) -> dict:
    log = ctx["log"]
    p = job.get("params", {}) or {}
    prob_h5 = p["prob_h5"]
    out_obj = p["out_obj"]
    sigma = float(p.get("sigma_smoothing", 2))
    targetlen = float(p.get("targetlen", 1))
    isovalue = float(p.get("isovalue", 0.40))
    resolution = tuple(p.get("resolution_in_microns", (0.4092, 0.4092, 0.4092)))
    subsampling = tuple(p.get("subsampling_factors", (0.125, 0.125, 0.125)))
    os.makedirs(os.path.dirname(out_obj) or ".", exist_ok=True)

    _generate_mesh(prob_h5, out_obj, sigma=sigma, targetlen=targetlen, isovalue=isovalue,
                   resolution=resolution, subsampling=subsampling, log=log)
    return {"artifacts": [{"kind": "mesh", "path": out_obj,
                          "meta": {"sigma": sigma, "targetlen": targetlen, "isovalue": isovalue}}]}
