"""
Blender-python script — runs INSIDE Blender (has bpy + blender_tissue_cartography).
Invoked by steps/blender_pullback.py as:

    blender --background --python make_pullback.py -- '<json-args>'

Drop your existing Blender pullback / UV-unwrap code into generate_pullback().
Everything around it (arg parsing, headless entry) is wired for you.
"""
import json
import sys


def parse_args():
    # args after the "--" separator are ours, not Blender's
    argv = sys.argv
    raw = argv[argv.index("--") + 1] if "--" in argv else "{}"
    return json.loads(raw)


def generate_pullback(mesh_obj, out_dir, rotation=None, layer="outer"):
    # ======================================================================
    # TODO(Mike): paste your Blender pullback code here. Typically:
    #   import bpy
    #   from blender_tissue_cartography import ...
    #   - import mesh_obj
    #   - apply `rotation` (from mesoderm alignment, SOP step 15)
    #   - UV unwrap / generate surface pullback (SOP step 16)
    #   - separate mesoderm vs ectoderm surface (SOP step 17)
    #   - write pullback PNG(s) into out_dir
    # ======================================================================
    raise NotImplementedError(
        f"Paste Blender pullback code into make_pullback.py "
        f"(mesh={mesh_obj} -> {out_dir}, layer={layer}, rotation={rotation})"
    )


if __name__ == "__main__":
    a = parse_args()
    generate_pullback(a["mesh_obj"], a["out_dir"], a.get("rotation"), a.get("layer", "outer"))
