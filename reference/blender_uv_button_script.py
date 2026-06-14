import bpy

### INSTRUCTIONS

# This script batch-processes UV map generation by orthogonal projection to
# a spatially registered reference mesh.

# 0) Press Alt+P to run this script. This will add a button in the "Scene" tab
# 1) Select all meshes you want to process, and the reference mesh
# 2) Make sure the reference mesh is the "active" one (highlighted in light orange)

    
class BatchOrthogonalProject(bpy.types.Operator):
    """Transfer UV map from active (light orange) to selected (dark orange) meshes by projection along active mesh normals."""
    bl_idname = "scene.batch_orthogonal_project"
    bl_label = "Batch transfer UV via orthogonal projection"

    def execute(self, context):
        # get meshes to process
        reference_mesh = context.active_object
        to_process = sorted([x for x in context.selected_objects if not x==reference_mesh], key=lambda x: x.name)
        
        # Validate selection
        if not reference_mesh.data.uv_layers:
            self.report({'ERROR'}, "The active mesh does not have a UV map!")
            return {'CANCELLED'}
        if len(to_process) == 0:
            self.report({'ERROR'}, "No meshes selected for processing!")
            return {'CANCELLED'}
        
        bpy.ops.object.select_all(action="DESELECT")
        
        for mesh in to_process:
            if mesh.modifiers:
                self.report({'ERROR'}, "Meshes to process can't have modifiers. Please apply any modifiers beforehand.")
                return {'CANCELLED'}

            # copy mesh
            wrapped_mesh = mesh.copy()
            wrapped_mesh.data = mesh.data.copy()
            bpy.context.collection.objects.link(wrapped_mesh)
            wrapped_mesh.name = f"{mesh.name}_wrapped"
            # wrap the copied mesh to the reference via orthogonal projection
            shrinkwrap = wrapped_mesh.modifiers.new(name="Shrinkwrap", type='SHRINKWRAP')
            shrinkwrap.target = reference_mesh
            shrinkwrap.wrap_method = 'TARGET_PROJECT'
            # first data transfer modifier
            data_transfer_wrapped = wrapped_mesh.modifiers.new(name="DataTransferWrapped", type='DATA_TRANSFER')
            data_transfer_wrapped.object = reference_mesh
            data_transfer_wrapped.use_loop_data = True
            data_transfer_wrapped.data_types_loops = {'UV'}
            data_transfer_wrapped.loop_mapping = 'POLYINTERP_NEAREST'
            # apply modifiers
            bpy.context.view_layer.objects.active = wrapped_mesh
            bpy.ops.object.modifier_apply(modifier="Shrinkwrap")
            bpy.ops.object.datalayout_transfer(modifier="DataTransferWrapped")
            bpy.ops.object.modifier_apply(modifier="DataTransferWrapped")
            # second data transfer modifier
            data_transfer = mesh.modifiers.new(name="DataTransfer", type='DATA_TRANSFER')
            data_transfer.object = wrapped_mesh
            data_transfer.use_loop_data = True
            data_transfer.data_types_loops = {'UV'}
            data_transfer.loop_mapping = 'TOPOLOGY'
            # apply modifiers
            bpy.context.view_layer.objects.active = mesh
            bpy.ops.object.datalayout_transfer(modifier="DataTransfer")
            bpy.ops.object.modifier_apply(modifier="DataTransfer")
            # start edit mode
            bpy.ops.object.mode_set(mode='EDIT')
            # select all faces
            bpy.ops.mesh.select_all(action='SELECT')
            # recalculate outside normals 
            bpy.ops.mesh.normals_make_consistent(inside=False)
            # go object mode again
            bpy.ops.object.editmode_toggle()
            # export mesh
            mesh.select_set(True)
            # bpy.data.objects[active_object.name].select_set(True)
            bpy.ops.wm.obj_export(
             filepath=f"/Users/luoqiong/Downloads/{mesh.name}_UV.obj",
             export_selected_objects=True,
             export_triangulated_mesh=True,
            )
            mesh.select_set(False)

        bpy.context.view_layer.objects.active = reference_mesh
        self.report({'INFO'}, f"Batch processed {len(to_process)} meshes")
        return {'FINISHED'}

        
class OrthoProjectBatchPanel(bpy.types.Panel):
    """Class defining layout of user interface (buttons, inputs, etc.)"""
    bl_label = "UV transfer via orthonal projection"
    bl_idname = "SCENE_PT_orthogonal_projection"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        layout.operator("scene.batch_orthogonal_project", text="Batch transfer UV via orthogonal projection")


# Registering the operator
def register():
    bpy.utils.register_class(BatchOrthogonalProject)
    bpy.utils.register_class(OrthoProjectBatchPanel)

def unregister():
    bpy.utils.unregister_class(BatchOrthogonalProject)
    bpy.utils.unregister_class(OrthoProjectBatchPanel)

if __name__ == "__main__":
    register()
   
