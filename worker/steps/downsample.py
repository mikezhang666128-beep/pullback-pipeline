"""
Step: downsample  (capability "downsample")

Headless version of Jupyter "cell 3" — Create downsampled .h5 for Ilastik.
Reconstructed from the SOP screenshot; the FIXED settings (base/mean/stdev,
resolution, subsampling factors) match the notebook and "will not change".

Per-movie/per-channel inputs come from job.params:
    channel        : 0 | 1                       (Ch0 = tbx16-eGFP, Ch1 = H2B-RFP)
    filename_tmpl  : template w/ {time}, no extension (fused-data path)
    downname_tmpl  : template w/ {time}, no extension (export into 01_ds_data)
    t_start, t_end, t_step

IMPORTANT: filename_tmpl/downname_tmpl must use the SAME channel — mixing Ch0/Ch1
overwrites data and swaps channels (see SOP step 6.c.i). The dashboard enforces this
by generating the two channel jobs from one movie row.
"""
from __future__ import annotations

# ---- FIXED SETTINGS (do not change — from the SOP) -------------------------
BASE = 100
MEAN = 2048
STDEV = 64
RESOLUTION_IN_MICRONS = (0.4092, 0.4092, 0.4092)
SUBSAMPLING_FACTORS = (1 / 8, 1 / 8, 1 / 8)


def run(job: dict, ctx: dict) -> dict:
    import numpy as np
    from blender_tissue_cartography import io as tcio

    log = ctx["log"]
    p = job.get("params", {}) or {}
    channel = p.get("channel", 0)
    filename_tmpl = p["filename_tmpl"]      # e.g. ".../TP{time}_Ch0_Il10_Ang0,45,...,315"
    downname_tmpl = p["downname_tmpl"]      # e.g. ".../01_ds_data/TP{time}_Ch{ch}"
    t_start = int(p.get("t_start", 0))
    t_end = int(p.get("t_end", 0))
    t_step = int(p.get("t_step", 1))

    artifacts = []
    timepoints = list(range(t_start, t_end + 1, t_step))
    log(f"downsample Ch{channel}: {len(timepoints)} timepoints "
        f"({t_start}..{t_end} step {t_step})")

    for t in timepoints:
        filename = filename_tmpl.format(time=t)
        downname = downname_tmpl.format(time=t, ch=channel)

        image = tcio.adjust_axis_order(tcio.imread(f"{filename}.tif"))
        converted = image.astype(np.int16)
        adjusted = np.clip(converted - BASE, a_min=0, a_max=None)
        standardized = (adjusted - np.mean(adjusted)) * (STDEV / np.std(adjusted)) + MEAN
        reconverted = standardized.astype(np.uint16)
        subsampled = tcio.subsample_image(
            reconverted, SUBSAMPLING_FACTORS, use_block_averaging_if_possible=True
        )
        out_h5 = f"{downname}.h5"
        tcio.write_h5(out_h5, subsampled)

        artifacts.append({"kind": "ds_h5", "path": out_h5,
                          "meta": {"channel": channel, "timepoint": t}})
        if t % 20 == 0 or t == timepoints[-1]:
            log(f"  TP{t} -> {out_h5}")

    log(f"downsample Ch{channel} complete: {len(artifacts)} files")
    return {"artifacts": artifacts,
            "summary": {"channel": channel, "n_files": len(artifacts)}}
