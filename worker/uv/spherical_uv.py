"""
Pure-Python UV unwrap for cartographic pullbacks. Two projection modes:

  azimuthal (DEFAULT) -- polar / disk layout. Angle-around-the-pole -> direction,
      angle-from-the-pole -> radius. Maps the embryo CAP to a CIRCLE (the lab's
      "octopus circle" layout). No longitude seam; only singularity is the antipode
      (the rim of the disk).
  equirectangular     -- longitude->u, latitude->v. Fills the whole [0,1]^2 SQUARE
      (a full-sphere unwrap). Kept for reference; this is what made the square pullback.

The "pole" (which way the cap faces) is estimated from the mesh as
    pole = normalize(mean(verts) - bbox_center)
i.e. the direction the surface bulges. Override with job param `pole_axis=[x,y,z]`
if the auto axis is wrong. Radius is normalized so the data fills the disk.

Writes an OBJ with v / vt / vn / f(v/vt/vn). Normals recomputed + oriented outward.
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


def _basis_from_pole(pole):
    """Two unit vectors spanning the plane perpendicular to `pole`."""
    import numpy as np
    pole = pole / (np.linalg.norm(pole) or 1.0)
    seed = np.array([1.0, 0.0, 0.0]) if abs(pole[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    e1 = np.cross(pole, seed); e1 /= (np.linalg.norm(e1) or 1.0)
    e2 = np.cross(pole, e1)
    return pole, e1, e2


def azimuthal_uv(verts, center, pole):
    """Azimuthal-equidistant projection onto a disk centered at (0.5, 0.5)."""
    import numpy as np
    pole, e1, e2 = _basis_from_pole(pole)
    d = verts - center
    d = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-12)
    cos_a = np.clip(d @ pole, -1.0, 1.0)
    phi = np.arccos(cos_a)                       # 0 at pole .. pi at antipode
    phi_max = float(phi.max()) or 1.0
    r = 0.49 * (phi / phi_max)                   # normalize so data fills the disk
    theta = np.arctan2(d @ e2, d @ e1)
    u = 0.5 + r * np.cos(theta)
    v = 0.5 + r * np.sin(theta)
    return np.stack([u, v], axis=1)


def equirectangular_uv(verts, center):
    import numpy as np
    d = verts - center
    d = d / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-12)
    u = 0.5 + np.arctan2(d[:, 1], d[:, 0]) / (2 * np.pi)
    v = 0.5 - np.arcsin(np.clip(d[:, 2], -1.0, 1.0)) / np.pi
    return np.stack([u, v], axis=1)


def vertex_normals(verts, faces, center):
    import numpy as np
    vn = np.zeros_like(verts)
    for face in faces:
        for k in range(1, len(face) - 1):
            a, b, c = face[0], face[k], face[k + 1]
            fn = np.cross(verts[b] - verts[a], verts[c] - verts[a])
            vn[a] += fn; vn[b] += fn; vn[c] += fn
    norms = np.linalg.norm(vn, axis=1, keepdims=True); norms[norms == 0] = 1.0
    vn /= norms
    flip = np.einsum("ij,ij->i", vn, verts - center) < 0
    vn[flip] *= -1.0
    return vn


def unwrap(in_obj, out_obj, log=print, projection="azimuthal", pole_axis=None):
    import numpy as np
    verts, faces = read_obj(in_obj)
    if len(verts) == 0 or len(faces) == 0:
        raise RuntimeError("empty mesh: %s" % in_obj)

    center = (verts.min(axis=0) + verts.max(axis=0)) / 2.0

    if projection == "equirectangular":
        uv = equirectangular_uv(verts, center)
        periodic = True       # has a longitude seam -> duplicate straddling faces
    else:
        if pole_axis is not None:
            pole = np.asarray(pole_axis, dtype=float)
        else:
            pole = verts.mean(axis=0) - center
            if np.linalg.norm(pole) < 1e-6:          # near-symmetric mesh: fall back
                pole = np.array([0.0, 0.0, 1.0])     # to shortest bbox axis (the "flat" one)
                ext = verts.max(axis=0) - verts.min(axis=0)
                pole = np.eye(3)[int(np.argmin(ext))]
        uv = azimuthal_uv(verts, center, pole)
        periodic = False
        log("azimuthal pole axis = %s" % np.round(pole / (np.linalg.norm(pole) or 1), 3).tolist())

    vn = vertex_normals(verts, faces, center)

    vt_list = uv.tolist()
    dup = {}
    face_vt = []
    for face in faces:
        straddles = periodic and (max(uv[i, 0] for i in face) - min(uv[i, 0] for i in face)) > 0.5
        corner = []
        for i in face:
            if straddles and uv[i, 0] < 0.5:
                if i not in dup:
                    vt_list.append([uv[i, 0] + 1.0, uv[i, 1]]); dup[i] = len(vt_list) - 1
                corner.append(dup[i])
            else:
                corner.append(i)
        face_vt.append(corner)

    with open(out_obj, "w") as f:
        f.write("# UV unwrap (pure-python, %s)\n" % projection)
        for p in verts:
            f.write("v %.6f %.6f %.6f\n" % (p[0], p[1], p[2]))
        for t in vt_list:
            f.write("vt %.6f %.6f\n" % (t[0], t[1]))
        for nrm in vn:
            f.write("vn %.6f %.6f %.6f\n" % (nrm[0], nrm[1], nrm[2]))
        for face, fvt in zip(faces, face_vt):
            parts = " ".join("%d/%d/%d" % (face[k] + 1, fvt[k] + 1, face[k] + 1)
                             for k in range(len(face)))
            f.write("f " + parts + "\n")

    log("UV unwrap (%s) -> %s  [%d verts, %d uv, %d faces]"
        % (projection, out_obj, len(verts), len(vt_list), len(faces)))
    return out_obj


if __name__ == "__main__":
    import sys
    unwrap(sys.argv[1], sys.argv[2])
