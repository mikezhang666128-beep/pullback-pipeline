"""
Pure-Python spherical UV unwrap  --  replaces the manual Blender step.

The lab's Blender workflow was: drop a sphere that encloses the embryo mesh, then
transfer the sphere's UV onto the mesh by projection. For an enclosing sphere centred
on the mesh, that projection is radial: every mesh vertex inherits the UV of the sphere
point straight out from the centre. A sphere's UV *is* a spherical (equirectangular)
coordinate map, so the whole thing is:

    u = 0.5 + atan2(ny, nx) / (2*pi)      # longitude  (seam at -X)
    v = 0.5 - asin(nz)      / pi          # latitude

where (nx,ny,nz) is the unit direction from the mesh centre to the vertex. The v term is
SUBTRACTED so the 2D UV triangle winding matches the 3D outward face orientation -- without
that flip, btc flags ~every triangle as "flipped"/self-intersecting (a global handedness
inversion). No Blender, no Fiji measuring -- sphere size/centre fall out of the geometry.

Seam handling: a triangle straddling the longitude seam (u jumps ~1 -> ~0) would smear
across UV space. We keep UVs per-loop (OBJ allows more `vt` than `v`) and push the low-u
corners of a straddling face to u+1, so each triangle stays compact -- same as Blender's
per-loop UVs on export.

Writes an OBJ with v / vt / vn / f(v/vt/vn). Normals are recomputed and oriented outward.
"""
from __future__ import annotations


def read_obj(path):
    import numpy as np
    verts, faces = [], []
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                idx = [int(p.split("/")[0]) for p in line.split()[1:]]
                faces.append([i - 1 for i in idx])
    return np.asarray(verts, dtype=float), faces


def spherical_uv(verts, center):
    import numpy as np
    d = verts - center
    r = np.linalg.norm(d, axis=1)
    r[r == 0] = 1.0
    n = d / r[:, None]
    u = 0.5 + np.arctan2(n[:, 1], n[:, 0]) / (2 * np.pi)
    v = 0.5 - np.arcsin(np.clip(n[:, 2], -1.0, 1.0)) / np.pi
    return np.stack([u, v], axis=1)


def vertex_normals(verts, faces, center):
    """Area-weighted vertex normals, flipped to point outward (away from centre)."""
    import numpy as np
    vn = np.zeros_like(verts)
    for face in faces:
        for k in range(1, len(face) - 1):  # triangulate fan for n-gons
            a, b, c = face[0], face[k], face[k + 1]
            fn = np.cross(verts[b] - verts[a], verts[c] - verts[a])
            vn[a] += fn
            vn[b] += fn
            vn[c] += fn
    norms = np.linalg.norm(vn, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    vn /= norms
    outward = verts - center
    flip = np.einsum("ij,ij->i", vn, outward) < 0
    vn[flip] *= -1.0
    return vn


def unwrap(in_obj, out_obj, log=print):
    import numpy as np
    verts, faces = read_obj(in_obj)
    if len(verts) == 0 or len(faces) == 0:
        raise RuntimeError("empty mesh: %s" % in_obj)

    center = (verts.min(axis=0) + verts.max(axis=0)) / 2.0
    uv = spherical_uv(verts, center)
    vn = vertex_normals(verts, faces, center)

    # per-loop UVs: one vt per vertex, plus duplicates for seam-straddling faces
    vt_list = uv.tolist()
    dup = {}
    face_vt = []
    for face in faces:
        us = [uv[i, 0] for i in face]
        straddles = (max(us) - min(us)) > 0.5
        corner = []
        for i in face:
            if straddles and uv[i, 0] < 0.5:
                if i not in dup:
                    vt_list.append([uv[i, 0] + 1.0, uv[i, 1]])
                    dup[i] = len(vt_list) - 1
                corner.append(dup[i])
            else:
                corner.append(i)
        face_vt.append(corner)

    with open(out_obj, "w") as f:
        f.write("# spherical UV unwrap (pure-python)\n")
        for p in verts:
            f.write("v %.6f %.6f %.6f\n" % (p[0], p[1], p[2]))
        for t in vt_list:
            f.write("vt %.6f %.6f\n" % (t[0], t[1]))
        for nrm in vn:
            f.write("vn %.6f %.6f %.6f\n" % (nrm[0], nrm[1], nrm[2]))
        for face, fvt in zip(faces, face_vt):
            parts = " ".join(
                "%d/%d/%d" % (face[k] + 1, fvt[k] + 1, face[k] + 1)
                for k in range(len(face))
            )
            f.write("f " + parts + "\n")

    log("UV unwrap (spherical, pure-python) -> %s  [%d verts, %d uv, %d faces]"
        % (out_obj, len(verts), len(vt_list), len(faces)))
    return out_obj


if __name__ == "__main__":
    import sys
    unwrap(sys.argv[1], sys.argv[2])
