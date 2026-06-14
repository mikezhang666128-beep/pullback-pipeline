"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Classifier = { marker: string; trained: boolean; notes: string | null };
type Job = {
  id: string; run_id: string | null; step: string; capability: string;
  status: string; logs: string | null;
};
type Artifact = { job_id: string; kind: string; path: string };

const STATUS_COLOR: Record<string, string> = {
  queued: "#9ca3af", blocked: "#6b7280", running: "#3b82f6",
  done: "#22c55e", failed: "#ef4444", canceled: "#6b7280",
};
const STEP_ORDER = ["downsample", "ilastik_predict", "mesh", "pullback"];

export default function Home() {
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [marker, setMarker] = useState("");
  const [rawImage, setRawImage] = useState("");
  const [timepoint, setTimepoint] = useState(0);
  const [workDir, setWorkDir] = useState("/home/streichansuper/mike_out");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data: c } = await supabase.from("classifiers")
      .select("marker,trained,notes").eq("active", true).order("marker");
    const { data: j } = await supabase.from("jobs")
      .select("id,run_id,step,capability,status,logs")
      .order("created_at", { ascending: true });
    const { data: a } = await supabase.from("artifacts").select("job_id,kind,path");
    setClassifiers(c ?? []);
    setJobs(j ?? []);
    setArtifacts(a ?? []);
    if (!marker && c && c.length) setMarker(c[0].marker);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "artifacts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line

  async function runPipeline() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marker, rawImage, timepoint, workDir }),
    });
    const out = await res.json();
    setMsg(res.ok ? (out.warning ? `Queued ⚠ ${out.warning}` : "Pipeline queued ✓")
                  : `Error: ${out.error}`);
    await load(); setBusy(false);
  }

  // group jobs into runs, newest first
  const runIds = Array.from(new Set(jobs.map((j) => j.run_id).filter(Boolean))) as string[];
  runIds.reverse();
  const selected = classifiers.find((c) => c.marker === marker);

  return (
    <div>
      {/* ---- Front door ---- */}
      <div style={card}>
        <h2 style={{ margin: "0 0 14px" }}>Run a pullback</h2>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" }}>
          <label>Marker</label>
          <select value={marker} onChange={(e) => setMarker(e.target.value)} style={input}>
            {classifiers.map((c) => (
              <option key={c.marker} value={c.marker}>
                {c.marker}{c.trained ? "" : "  (not trained)"}
              </option>
            ))}
          </select>

          <label>Raw image</label>
          <input value={rawImage} onChange={(e) => setRawImage(e.target.value)}
                 placeholder="/mnt/crunch/.../TP0_pMyo_crop.tif" style={input} />

          <label>Timepoint</label>
          <input type="number" value={timepoint}
                 onChange={(e) => setTimepoint(Number(e.target.value))} style={input} />

          <label>Output dir</label>
          <input value={workDir} onChange={(e) => setWorkDir(e.target.value)} style={input} />
        </div>

        {selected && !selected.trained && (
          <p style={{ color: "#f59e0b", fontSize: 13, marginTop: 10 }}>
            ⚠ The {selected.marker} classifier isn’t fully trained — results may be poor until you finish labeling it in Ilastik.
          </p>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={runPipeline} disabled={busy || !rawImage || !marker} style={btn}>
            {busy ? "Queuing…" : "▶ Run pipeline"}
          </button>
          {msg && <span style={{ color: "#8a93a6", fontSize: 14 }}>{msg}</span>}
        </div>
      </div>

      {/* ---- Runs / status ---- */}
      {runIds.length === 0 && (
        <p style={{ color: "#8a93a6" }}>No runs yet. Fill the form above and hit Run.</p>
      )}
      {runIds.map((rid) => {
        const rj = jobs.filter((j) => j.run_id === rid)
          .sort((a, b) => STEP_ORDER.indexOf(a.capability) - STEP_ORDER.indexOf(b.capability));
        const pullJob = rj.find((j) => j.capability === "pullback");
        const pull = pullJob && artifacts.find((a) => a.job_id === pullJob.id && a.kind === "pullback");
        return (
          <div key={rid} style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rj.map((j) => (
                <span key={j.id} title={j.logs ?? ""} style={{
                  ...pill, borderColor: STATUS_COLOR[j.status] ?? "#6b7280",
                  color: STATUS_COLOR[j.status] ?? "#6b7280",
                }}>
                  {j.capability} · {j.status}
                </span>
              ))}
            </div>
            {pull && (
              <p style={{ color: "#22c55e", fontSize: 13, marginTop: 12 }}>
                ✓ Pullback ready: <code style={{ color: "#cbd5e1" }}>{pull.path}</code>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #1f2633", borderRadius: 10, padding: 16, marginBottom: 12, background: "#11151f",
};
const btn: React.CSSProperties = {
  background: "#2563eb", color: "white", border: "none", borderRadius: 8,
  padding: "9px 16px", cursor: "pointer", fontSize: 14,
};
const pill: React.CSSProperties = {
  border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12,
};
const input: React.CSSProperties = {
  background: "#0b0e14", color: "#e5e7eb", border: "1px solid #1f2633",
  borderRadius: 8, padding: "8px 10px", fontSize: 14,
};
