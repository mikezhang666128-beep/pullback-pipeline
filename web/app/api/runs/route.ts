import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Server-only client (service role) — builds the job chain with blocked_by links.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

type Movie = {
  id: string;
  working_dir: string | null;
  ch0_path: string | null;
  ch1_path: string | null;
  ilp_path: string | null;
  t_start: number; t_end: number; t_step: number;
  sigma_smoothing: number; targetlen: number; isovalue: number;
};

// POST /api/runs  { movieId }  -> creates a run + the per-step job chain for that movie.
export async function POST(req: NextRequest) {
  const { movieId } = await req.json();

  const { data: movie, error } = await admin
    .from("movies").select("*").eq("id", movieId).single<Movie>();
  if (error || !movie) {
    return NextResponse.json({ error: "movie not found" }, { status: 404 });
  }

  const wd = movie.working_dir ?? ".";
  const ds = `${wd}/01_ds_data`;
  const meshDir = `${wd}/02_meshes`;
  const pullDir = `${wd}/03_pullbacks`;
  const t = { t_start: movie.t_start, t_end: movie.t_end, t_step: movie.t_step };

  // create the run envelope
  const { data: run } = await admin
    .from("runs").insert({ movie_id: movie.id, status: "running" }).select().single();

  // The pipeline, as a dependency chain. Each step is blocked_by the previous.
  // (Single-box setup: one worker runs them all in order — no file shuttling.)
  const steps = [
    {
      step: "downsample_ch0", capability: "downsample",
      params: { channel: 0, filename_tmpl: movie.ch0_path,
                downname_tmpl: `${ds}/TP{time}_Ch{ch}`, ...t },
    },
    {
      step: "downsample_ch1", capability: "downsample",
      params: { channel: 1, filename_tmpl: movie.ch1_path,
                downname_tmpl: `${ds}/TP{time}_Ch{ch}`, ...t },
    },
    {
      step: "ilastik_predict", capability: "ilastik_predict",
      params: { ilp_path: movie.ilp_path, input_glob: `${ds}/TP*_Ch0.h5`,
                output_dir: ds, export_source: "Probabilities Stage 2" },
    },
    {
      step: "mesh", capability: "mesh",
      params: { prob_h5: `${ds}/PROBABILITIES`, out_obj: `${meshDir}/mesoderm.obj`,
                sigma_smoothing: movie.sigma_smoothing,
                targetlen: movie.targetlen, isovalue: movie.isovalue },
    },
    {
      step: "fiji_pullback", capability: "fiji_measure",
      params: { input_path: `${meshDir}/mesoderm.obj`, out_dir: pullDir },
    },
  ];

  let prevId: string | null = null;
  const created: string[] = [];
  for (const s of steps) {
    const { data: job } = await admin.from("jobs").insert({
      run_id: run!.id, movie_id: movie.id, step: s.step, capability: s.capability,
      status: "queued", blocked_by: prevId, params: s.params,
    }).select().single();
    prevId = job!.id;
    created.push(job!.id);
  }

  return NextResponse.json({ runId: run!.id, jobIds: created });
}
