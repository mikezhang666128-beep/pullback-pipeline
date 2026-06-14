"""
Quick standalone test of the REAL downsample step on one local .tif.
Run inside the `btc` conda env, from the worker/ folder:
    python test_downsample.py
It auto-finds the .tif in C:\zebrafish\tbx16_test and writes a downsampled .h5 next to it.
"""
import glob
import os
from steps.downsample import run

FOLDER = r"C:\zebrafish\tbx16_test"

tifs = glob.glob(os.path.join(FOLDER, "*.tif"))
assert tifs, f"No .tif found in {FOLDER} -- put your TP0 tbx16 crop there."
infile = tifs[0]
stem = os.path.splitext(os.path.basename(infile))[0]
print("Input file :", infile)

job = {"params": {
    "channel": 0,
    "filename_tmpl": os.path.join(FOLDER, stem),            # code appends .tif
    "downname_tmpl": os.path.join(FOLDER, stem + "_downsized"),
    "t_start": 0, "t_end": 0, "t_step": 1,
}}
ctx = {"log": print}

result = run(job, ctx)
print("RESULT:", result)
print("\nLook in", FOLDER, "for the new *_downsized.h5 file.")
