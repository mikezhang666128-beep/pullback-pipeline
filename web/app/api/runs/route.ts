import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
function stripTif(p: string) { return p.replace(/\.tiff?$/i, ""); }

// POST /api/runs { marker, stage, rawImage, timepoint, workDir, mode }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const marker: string = body.marker;
  const stage: string = body.stage ?? "";
  const rawImage: string = body.rawImage;
  const timepoint: number = Number(body.timepoint ?? 0);
  const workDir: string = (body.workDir ?? "/home/streichansuper/mike_out").replace(/\/+$/, "");
  const mode: string = body.mode === "pullback" ? "pullback" : "mesh";
  const userId: string | null = body.userId ?? null;
  const userTag: string = String(body.userTag ?? "shared").replace(/[^a-zA-Z0-9_-]/g, "_");

  if (!marker || !rawImage) {
    return NextResponse.json({ error: "marker and rawImage are required" }, { status: 400 });
  }

  const { data: clf } = await admin
    .from("classifiers").select("ilp_path, channel, trained, stage")
    .eq("marker", marker).eq("stage", stage).eq("active", true).maybeSingle();
  if (!clf) {
    return NextResponse.json({ error: `no classifier for ${marker} @ ${stage || "(no stage)"}` }, { status: 404 });
  }

  const userDir = `${workDir}/${userTag}`;
  const ch = clf.channel ?? 0;
  const tag = stage ? `${marker}_${stage}` : marker;
  const stem = `TP${timepoint}_${tag}`;
  const dsStem = `${stem}_Ch${ch}`;
  const dsH5 = `${userDir}/${dsStem}.h5`;
  const probH5 = `${userDir}/${dsStem}_Probabilities Stage 2.h5`;
  const meshObj = `${userDir}/${stem}_mesh.obj`;
  const outPrefix = `${userDir}/${stem}`;
  const t = { t_start: timepoint, t_end: timepoint, t_step: 1 };

  const { data: run } = await admin.from("runs").insert({ status: "running", created_by: userId }).select().single();

  const allSteps = [
    { step: `downsample_${dsStem}`, capability: "downsample",
      params: { channel: ch, filename_tmpl: stripTif(rawImage),
                downname_tmpl: `${userDir}/TP{time}_${tag}_Ch{ch}`, ...t } },
    { step: "ilastik_predict", capability: "ilastik_predict",
      params: { ilp_path: clf.ilp_path, input_glob: dsH5,
                output_dir: userDir, export_source: "Probabilities Stage 2" } },
    { step: "mesh", capability: "mesh",
      params: { prob_h5: probH5, out_obj: meshObj } },
    { step: "pullback", capability: "pullback",
      params: { mesh_obj: meshObj, raw_image: rawImage, out_prefix: outPrefix,
                uv_grid_steps: 2048, use_fallback: true } },
  ];
  const steps = mode === "pullback" ? allSteps : allSteps.slice(0, 3);

  let prevId: string | null = null;
  const created: string[] = [];
  for (const s of steps) {
    const { data: job } = await admin.from("jobs").insert({
      run_id: run!.id, step: s.step, capability: s.capability,
      status: "queued", blocked_by: prevId, params: s.params,
    }).select().single();
    prevId = job!.id;
    created.push(job!.id);
  }
  return NextResponse.json({
    runId: run!.id, jobIds: created, mode,
    warning: clf.trained ? null : `Classifier for ${marker} @ ${stage} is not fully trained.`,
  });
}
