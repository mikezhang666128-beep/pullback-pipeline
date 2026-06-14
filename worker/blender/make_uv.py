"""
Headless Blender: give a mesh.obj a UV map by orthogonal projection onto a sphere
that's auto-generated to enclose the embryo. Replicates the lab's manual Blender step
(import sphere -> seams from islands -> transfer UV via the "premade button") but with
the sphere CREATED in code (Mike: "sphere is just a sphere to cover the embryo") and
sized automatically from the mesh's bounding box.

Run:
    blender --background --python make_uv.py -- '<json-args>'
json args: {"mesh_obj": "...in.obj", "out_uv": "...out_UV.obj"}

The UV-transfer logic (shrinkwrap TARGET_PROJECT + DATA_TRANSFER) is taken verbatim
from the lab's button script (reference/blender_uv_button_script.py).
"""
import bpy
import sys
import json
import mathutils


def parse_args():
    argv = sys.argv
    raw = argv[argv.index("--") + 1] if "--" in argv else "{}"
    return json.loads(raw)


def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_obj(path):
    before = set(bpy.data.objects)
    # Blender 4.x importer; fall back to legacy name if needed
    try:
        bpy.ops.wm.obj_import(filepath=path)
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return new[0]


def export_obj(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.wm.obj_export(filepath=path, export_selected_objects=True,
                              export_triangulated_mesh=True, export_uv=True)
    except AttributeError:
        bpy.ops.export_scene.obj(filepath=path, use_selection=True, use_triangles=True)


def make_enclosing_sphere(mesh):
    """Create a UV sphere centered on the mesh, scaled ~20% bigger than its bbox."""
    coords = [mesh.matrix_world @ mathutils.Vector(c) for c in mesh.bound_box]
    mn = mathutils.Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    mx = mathutils.Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    center = (mn + mx) / 2
    radius = max((mx - mn)) / 2 * 1.2
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=center,
                                         segments=64, ring_count=32)
    sphere = bpy.context.active_object
    # subdivide twice (lab note) for a denser reference
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=1)
    bpy.ops.mesh.subdivide(number_cuts=1)
    # (primitive_uv_sphere already carries a UV map; that's our "seams from islands")
    bpy.ops.object.mode_set(mode="OBJECT")
    return sphere


def transfer_uv(reference_mesh, mesh):
    """Lab button-script logic: shrinkwrap a copy onto the sphere, copy UV by projection,
    then copy UV back onto the original by topology."""
    wrapped = mesh.copy()
    wrapped.data = mesh.data.copy()
    bpy.context.collection.objects.link(wrapped)
    wrapped.name = f"{mesh.name}_wrapped"

    sw = wrapped.modifiers.new(name="Shrinkwrap", type="SHRINKWRAP")
    sw.target = reference_mesh
    sw.wrap_method = "TARGET_PROJECT"

    dt1 = wrapped.modifiers.new(name="DataTransferWrapped", type="DATA_TRANSFER")
    dt1.object = reference_mesh
    dt1.use_loop_data = True
    dt1.data_types_loops = {"UV"}
    dt1.loop_mapping = "POLYINTERP_NEAREST"

    bpy.context.view_layer.objects.active = wrapped
    bpy.ops.object.modifier_apply(modifier="Shrinkwrap")
    bpy.ops.object.datalayout_transfer(modifier="DataTransferWrapped")
    bpy.ops.object.modifier_apply(modifier="DataTransferWrapped")

    dt2 = mesh.modifiers.new(name="DataTransfer", type="DATA_TRANSFER")
    dt2.object = wrapped
    dt2.use_loop_data = True
    dt2.data_types_loops = {"UV"}
    dt2.loop_mapping = "TOPOLOGY"

    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.datalayout_transfer(modifier="DataTransfer")
    bpy.ops.object.modifier_apply(modifier="DataTransfer")

    # recalc outside normals
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    a = parse_args()
    clean_scene()
    mesh = import_obj(a["mesh_obj"])
    print("imported mesh:", mesh.name)
    sphere = make_enclosing_sphere(mesh)
    print("created enclosing sphere:", sphere.name)
    transfer_uv(sphere, mesh)
    export_obj(mesh, a["out_uv"])
    print("UV mesh written ->", a["out_uv"])


if __name__ == "__main__":
    main()
