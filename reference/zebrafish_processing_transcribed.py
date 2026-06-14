"""
================================================================================
FAITHFUL TRANSCRIPTION of Mike's notebook: "20260220 - zebrafish_processing(1)"
Kernel: Python (blender_tissue_cartography)
Transcribed from phone photos on 2026-06-13.

This file is the SOURCE OF TRUTH for what the pipeline actually does. The worker
step runners (../worker/steps/*.py) are built from these cells.

⚠️  Long Windows/Linux path strings ran off the right edge of the photos. Every
    place a path is cut off is marked  # <-- TRUNCATED IN PHOTO: confirm full path.
    The app parameterizes these anyway (paths come from the Sheet/DB), so the
    truncations don't block automation — but please confirm them once.

Cells are in notebook order.
================================================================================
"""

# ──────────────────────────────────────────────────────────────────────────────
# CELL [6] — Imports  ("These settings will not change!")
# ──────────────────────────────────────────────────────────────────────────────
from blender_tissue_cartography import io as tcio
from blender_tissue_cartography import mesh as tcmesh
from blender_tissue_cartography import remesh as tcremesh
from blender_tissue_cartography import interpolation as tcinterp

import igl
import numpy as np
from pathlib import Path
from tqdm.notebook import tqdm
import matplotlib.pyplot as plt

import pymeshlab
from blender_tissue_cartography import remesh_pymeshlab as tcremesh_pymeshlab

from skimage.measure import label, regionprops

from scipy import interpolate
from PIL import Image

from scipy.interpolate import NearestNDInterpolator

from scipy.ndimage import gaussian_filter


# ──────────────────────────────────────────────────────────────────────────────
# CELL [7] — helper: split_connected_components
# ──────────────────────────────────────────────────────────────────────────────
def split_connected_components(mesh):
    """
    Split mesh into connected components.

    Will erase UV or other information.

    Parameters
    ----------
    mesh : tcmesh.ObjMesh
        Mesh

    Returns
    -------
    meshes : list of tcmesh.ObjMesh
        Connected components in decreasing order of number of vertices
    """
    connected_component = igl.vertex_components(mesh.faces)
    values, counts = np.unique(connected_component, return_counts=True)
    meshes = []
    for val in values:
        mask = connected_component == val
        connected_vertices = mesh.vertices[connected_component == val]
        connected_faces = mesh.faces[(connected_component[mesh.faces] == val).all(axis=1)]
        # relabel faces
        arr_to_selected = -1 * np.ones(mesh.vertices.shape[0]).astype(int)
        arr_to_selected[mask] = np.arange(np.count_nonzero(mask))
        connected_faces = arr_to_selected[connected_faces]
        meshes.append(tcmesh.ObjMesh(connected_vertices, connected_faces))
    meshes = [x for _, x in sorted(zip(counts, meshes), key=lambda pair: pair[0])][::-1]
    return meshes


# ──────────────────────────────────────────────────────────────────────────────
# CELL [10] — 01. Create downsampled .h5 for ilastik  (mesoderm Ch0)
# Note: in this run base=105, t_start=t_end=0 (a single-timepoint test).
# The "/mnt/crunch/..." paths are the school Linux box; D:\ paths appear elsewhere.
# ──────────────────────────────────────────────────────────────────────────────
def cell_01_downsample_for_ilastik():
    t_start = 0
    t_end = 0
    t_step = 1

    base = 105

    # DO NOT CHANGE
    mean = 2048
    stdev = 64

    for t in range(t_start, t_end + 1, t_step):
        metadata_dict = {'filename':
            '/mnt/crunch/undergrads/stained_embryos/tbx16-GFP_pMyo-568/8hpf/202605211550/cropped/TP0_pMyo_crop'.format(time=t)}
        metadata_dict['downname'] = \
            '/mnt/crunch/undergrads/stained_embryos/tbx16-GFP_pMyo-568/8hpf/202605211550/cropped/TP0_pMyo_crop_downsized'.format(time=t)
        metadata_dict['resolution_in_microns'] = (0.4092, 0.4092, 0.4092)
        metadata_dict['subsampling_factors'] = (1/8, 1/8, 1/8)
        image = tcio.adjust_axis_order(tcio.imread(f"{metadata_dict['filename']}.tif"))
        converted_image = image.astype(np.int16)
        adjusted_image = np.clip(converted_image - base, a_min=0, a_max=None)
        standard_image = (adjusted_image - np.mean(adjusted_image)) * (stdev / np.std(adjusted_image)) + mean
        reconverted_image = standard_image.astype(np.uint16)
        subsampled_image = tcio.subsample_image(
            reconverted_image, metadata_dict['subsampling_factors'], use_block_averaging_if_possible=True)
        tcio.write_h5(f"{metadata_dict['downname']}.h5", subsampled_image)


# ──────────────────────────────────────────────────────────────────────────────
# CELL — 02. Create meshes from probabilities
# Only the bottom of this cell was visible in the photos; the rest is reconstructed
# from the visible lines + the SOP params (sigma=2, targetlen=1, isovalue=0.40).
# VISIBLE lines (partial):
#     ...es_in_microns, faces)
#     ...component - deletes "blobs"
#     ...split_connected_components(mesh)[0]      # keep largest component
#     ...size
#     mesh_selected = ...                          # (largest connected component)
#     remeshed = tcremesh_pymeshlab.remesh_pymeshlab(mesh_selected, targetlen=targetlen)
#     ...write_obj(Path(metadata_dict['output_directory']),
#                  f"{Path(metadata_dict['filename']).stem}_mesh_remeshed.obj")
# ⚠️  The TOP of this cell (loading probabilities, gaussian smoothing with sigma,
#     marching cubes at isovalue) was OFF-SCREEN. Please send the top of "02."
# ──────────────────────────────────────────────────────────────────────────────
def cell_02_meshes_from_probabilities__PARTIAL():
    sigma = 2        # SOP: sigma smoothing
    targetlen = 1    # SOP: targetlen
    isovalue = 0.40  # SOP: isovalue
    # TODO: top of cell not captured — needs the photo of the start of "02.".
    raise NotImplementedError("Need the top of section 02 (probability load -> smooth -> marching cubes).")


# ──────────────────────────────────────────────────────────────────────────────
# How to process in Blender  (MANUAL step — between 02 meshing and 03 pullbacks)
#   1. import the sphere.obj
#   2. Go into "UV Editing" and get "Seams from Islands"
#   3. import mesh_remeshed
#   4. select sphere
#   5. press button
# Notes about the sphere:
#   - created with coordinates 415, -450, 450, scale 360, subdivided twice (default params)
#   - second movie used coordinates 380, -425, 470, scaled up 1.1 from the first movie
# Output of this step: "<stem>_mesh_remeshed_UV.obj"  (note the _UV suffix)
# ──────────────────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────────────────
# CELL — 03. Create pullbacks from meshes  (uses the UV-unwrapped mesh)
# Paths (from photos):
#   filename     : .../6hpf/202605211225/cropped/TP0_pMyo_crop_downsized-image_Probabilities Stage 2   # <-- TRUNCATED
#   mesh_name    : ...\\fused_crop_opto\\02_meshes\\TP{time}_Ch1_Probabilities Stage 2                  # <-- TRUNCATED
#   output_file  : ...\\fused_crop_opto\\03_pullbacks\\TP{time}_Ch1                                     # <-- TRUNCATED
# ──────────────────────────────────────────────────────────────────────────────
def cell_03_pullbacks_from_meshes():
    t_start = 1
    t_end = 1

    normal_offsets = np.arange(-45, 10, 0.7088)

    for t in range(t_start, t_end + 1):
        metadata_dict = {'filename':
            'D:\\embryo\\susie\\tbx16-GFP_H2B-RFP_opto-BMP\\202510091731\\...TP{time}...'.format(time=t)}  # <-- TRUNCATED
        metadata_dict['mesh_name'] = \
            'D:\\embryo\\susie\\...\\02_meshes\\TP{time}_Ch1_Probabilities Stage 2'.format(time=t)          # <-- TRUNCATED
        metadata_dict['output_file'] = \
            'D:\\embryo\\susie\\...\\03_pullbacks\\TP{time}_Ch1'.format(time=t)                             # <-- TRUNCATED
        metadata_dict['resolution_in_microns'] = (0.4092, 0.4092, 0.4092)
        metadata_dict['subsampling_factors'] = (1/8, 1/8, 1/8)
        image = tcio.adjust_axis_order(tcio.imread(f"{metadata_dict['filename']}.tif"))
        mesh_uv = tcmesh.ObjMesh.read_obj(f"{metadata_dict['mesh_name']}_mesh_remeshed_UV.obj")
        metadata_dict["normal_offsets"] = normal_offsets
        projected_data, projected_coordinates, projected_normals = tcinterp.create_cartographic_projections(
            image=f"{metadata_dict['filename']}.tif",
            mesh=f"{metadata_dict['mesh_name']}_mesh_remeshed_UV.obj",
            resolution=metadata_dict["resolution_in_microns"],
            normal_offsets=normal_offsets,
            uv_grid_steps=2048)
        projected_data[np.isnan(projected_data)] = 0
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_projected.tif", projected_data, z_axis=1)
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_3d_coordinates.tif", projected_coordinates)
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_normals.tif", projected_normals)


# ──────────────────────────────────────────────────────────────────────────────
# CELL — Make max intensity projections (MIP)
#   master_dir : D:\\embryo\\susie\\...\\202510091731\\...                # <-- TRUNCATED
# ──────────────────────────────────────────────────────────────────────────────
def cell_make_max_intensity_projections():
    import os
    import numpy as np
    import tifffile as tiff

    # User-defined parameters
    master_dir = 'D:\\embryo\\susie\\tbx16-GFP_H2B-RFP_opto-BMP\\202510091731\\...'  # <-- TRUNCATED
    file_base_name = 'TP%d_Ch%d_projected.tif'
    output_dir = os.path.join(master_dir, 'MIP')
    os.makedirs(output_dir, exist_ok=True)

    # Define ranges (edit if needed)
    timepoints = range(0, 50)   # TP0 ... TP99
    channels = [1]              # Ch0, Ch1

    # Processing loop
    for tp in timepoints:
        for ch in channels:
            filename = file_base_name % (tp, ch)
            filepath = os.path.join(master_dir, filename)
            if not os.path.exists(filepath):
                print(f"Skipping missing file: {filename}")
                continue
            print(f"Processing: {filename}")
            # Read TIFF stack (angles assumed along axis 0)
            stack = tiff.imread(filepath)
            # Max intensity projection over angles
            mip = np.max(stack, axis=0)
            # Save output
            out_name = f'TP{tp}_Ch{ch}_MIP.tif'
            out_path = os.path.join(output_dir, out_name)
            tiff.imwrite(out_path, mip)
    print("Max intensity projection complete.")


# ──────────────────────────────────────────────────────────────────────────────
# CELL — Create Downsampled Pullbacks for Segmentation of Nuclei
#   filename : ...\\03_pullbacks\\TP{time}_Ch1_projected      # <-- TRUNCATED
#   downname : ...\\04_ds_pullbacks\\{time}_Ch1               # <-- TRUNCATED
# (Note: NO base subtraction / clip here — just standardize to mean/stdev.)
# ──────────────────────────────────────────────────────────────────────────────
def cell_downsampled_pullbacks_for_nuclei():
    t_start = 0
    t_end = 50

    # DO NOT CHANGE
    mean = 2048
    stdev = 64

    for t in range(t_start, t_end + 1):
        metadata_dict = {'filename':
            'D:\\embryo\\susie\\...\\03_pullbacks\\TP{time}_Ch1_projected'.format(time=t)}   # <-- TRUNCATED
        metadata_dict['downname'] = \
            'D:\\embryo\\susie\\...\\04_ds_pullbacks\\{time}_Ch1'.format(time=t)             # <-- TRUNCATED
        image = tcio.adjust_axis_order(tcio.imread(f"{metadata_dict['filename']}.tif"))
        image[np.isnan(image)] = 0
        standard_image = (image - np.mean(image)) * (stdev / np.std(image)) + mean
        tcio.write_h5(f"{metadata_dict['downname']}.h5", standard_image)


# ──────────────────────────────────────────────────────────────────────────────
# CELL — Create Displacement Field from Simple Segmentation
#   downname : ...\\04_ds_pullbacks\\{time}_Ch1                                  # <-- TRUNCATED
#   save     : ...\\05_disp_fields\\output_{time}.png                            # <-- TRUNCATED
# Uses an Ilastik "Simple Segmentation" (.h5); class label 3 = nuclei here.
# ──────────────────────────────────────────────────────────────────────────────
def cell_displacement_field_from_simple_segmentation():
    t_start = 0
    t_end = 5

    threshold = 800
    sig = 20

    for t in range(t_start, t_end + 1):
        metadata_dict = {'downname':
            'D:\\embryo\\susie\\...\\04_ds_pullbacks\\{time}_Ch1'.format(time=t)}            # <-- TRUNCATED
        segmentation = tcio.read_h5(f"{metadata_dict['downname']}_Simple Segmentation.h5")[0]
        segmentation[segmentation != 3] = 0
        label_img = label(segmentation)
        blobs = regionprops(label_img)
        centers = []
        areas = []
        for blob in blobs:
            areas.append(blob.area)
            if blob.area > threshold:
                centers.append(blob.centroid)
        grid_x, grid_y = np.mgrid[0:2048, 0:2048]
        centers = np.array(centers)
        values = centers[:, 0]
        points = centers[:, 1:]
        grid_disp = interpolate.griddata(points, values, (grid_x, grid_y), method='linear')
        mask = np.where(~np.isnan(grid_disp))
        interp = NearestNDInterpolator(np.transpose(mask), grid_disp[mask])
        filled_data = interp(*np.indices(grid_disp.shape))
        norm_disp = (filled_data - np.min(filled_data)) / (np.max(filled_data) - np.min(filled_data))
        norm_disp = gaussian_filter(norm_disp, sigma=sig)
        norm_disp = np.uint8(255 * norm_disp)
        img = Image.fromarray(norm_disp)
        img.save('D:\\embryo\\susie\\...\\05_disp_fields\\output_{time}.png'.format(time=t))  # <-- TRUNCATED


# ──────────────────────────────────────────────────────────────────────────────
# CELL — Generate Planar Pullbacks from Planar Meshes
#   filename    : ...\\fused_crop_opto\\TP{time}_Ch1_Ill0_Ang0,45,90,135,180,225,270,315   # <-- TRUNCATED
#   mesh_name   : ...\\06_planar_meshes\\TP{time}_Ch1_disp                                  # <-- TRUNCATED
#   output_file : ...\\07_planar_pullbacks\\TP{time}_Ch1                                    # <-- TRUNCATED
# ──────────────────────────────────────────────────────────────────────────────
def cell_planar_pullbacks_from_planar_meshes():
    t_start = 20
    t_end = 20

    normal_offsets = np.arange(-2, 3, 0.7088)  # (0, 15, 0.7088) this is for the ectoderm?

    for t in range(t_start, t_end + 1):
        metadata_dict = {'filename':
            'D:\\embryo\\susie\\...\\TP{time}_Ch1_Ill0_Ang0,45,90,135,180,225,270,315'.format(time=t)}  # <-- TRUNCATED
        metadata_dict['mesh_name'] = \
            'D:\\embryo\\susie\\...\\06_planar_meshes\\TP{time}_Ch1_disp'.format(time=t)                # <-- TRUNCATED
        metadata_dict['output_file'] = \
            'D:\\embryo\\susie\\...\\07_planar_pullbacks\\TP{time}_Ch1'.format(time=t)                  # <-- TRUNCATED
        metadata_dict['resolution_in_microns'] = (0.4092, 0.4092, 0.4092)
        metadata_dict['subsampling_factors'] = (1/8, 1/8, 1/8)
        image = tcio.adjust_axis_order(tcio.imread(f"{metadata_dict['filename']}.tif"))
        mesh_uv = tcmesh.ObjMesh.read_obj(f"{metadata_dict['mesh_name']}.obj")
        metadata_dict["normal_offsets"] = normal_offsets
        projected_data, projected_coordinates, projected_normals = tcinterp.create_cartographic_projections(
            image=f"{metadata_dict['filename']}.tif",
            mesh=f"{metadata_dict['mesh_name']}.obj",
            resolution=metadata_dict["resolution_in_microns"],
            normal_offsets=normal_offsets,
            uv_grid_steps=2048)
        projected_data[np.isnan(projected_data)] = 0
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_projected.tif", projected_data, z_axis=1)
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_3d_coordinates.tif", projected_coordinates)
        tcio.save_for_imageJ(f"{metadata_dict['output_file']}_normals.tif", projected_normals)
