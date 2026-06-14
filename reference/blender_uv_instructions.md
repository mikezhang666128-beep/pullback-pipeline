# Blender UV-unwrap step (lab notes — Elizaveta Drygin & Philip Zeng, 2026-03-30)

Captured from the lab comment thread (phone screenshots). This is the per-file UV-unwrap
that sits BETWEEN "02 meshes" and "03 pullbacks".

>>> KEY INSIGHT FOR AUTOMATION <<<
Step 6's "premade button" is already a Blender PYTHON SCRIPT ("20260115....py", the only
.py file in the "Zebrafish only" drive, run from Blender's Scripting window). So this step
is code, not hand-modeling — it can be run HEADLESS via `blender --background --python`.
If we get that script + sphere.obj, the UV step automates.

3/30 summary (Elizaveta):
1) retrain Ch1 for "gumdrop" shape
2) code for the button in Blender
   - "20260115...py" (only .py file) in the "Zebrafish only" drive
   - run from the "Scripting" window
   - filepath is set on line 80, e.g.  filepath = f"C:/Users/17603/Downloads/{mesh.name}_UV.obj"
   - save the new filepath for future use
3) import sphere (in "object" mode): "sphere.obj"
   - resize (~450): check image dims in Fiji; ensure pixels (if microns, divide by two)
   - move  ~ (2000, -1800, 2200) * 0.4092/2 = (410, -365, 450)   [depends on units]
   - select all -> "Seams from Islands" (UV menu, editing mode)
   - rotation: flip the seam so the smaller island is on top (y = 180 deg)
4) import the new Ch1 mesh
5) select sphere, then the mesh (sphere active = light orange)
6) click the premade button -> writes {mesh.name}_UV.obj to the line-80 filepath
7) transfer the file to the VIP remote computer, personal mesh folder -> mesh now has a UV map
8) go to step 03 in Jupyter; check filepaths: "filename" (microscope data),
   "meshname" (uv mesh), "output_file" (pullback dest; make an 03_pullback folder)
9) change normal_offsets to -5..5 (mesoderm) instead of 10..-45  [ectoderm uses other range]
10) run cell 03 (run the first two cells first)
11) open the pullback in Fiji — should look like an "octopus circle"

## To automate this headless we need from the postdoc:
- the "20260115...py" Blender script (the premade-button code)  <-- most important
- the sphere.obj template file
- the trained mesoderm/tbx16 .ilp  (Mike says this exists)
