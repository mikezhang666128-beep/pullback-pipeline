"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Classifier = { marker: string; stage: string; trained: boolean; notes: string | null; ilp_path: string };
type Job = { id: string; run_id: string | null; step: string; capability: string; status: string; logs: string | null };
type Artifact = { job_id: string; kind: string; path: string; meta: any };

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
  const [stage, setStage] = useState("");
  const [rawImage, setRawImage] = useState("");
  const [timepoint, setTimepoint] = useState(0);
  const [workDir, setWorkDir] = useState("/home/streichansuper/mike_out");
  const [mode, setMode] = useState<"mesh" | "pullback">("mesh");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [upMarker, setUpMarker] = useState("");
  const [upStage, setUpStage] = useState("");
  const [upChannel, setUpChannel] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [upMsg, setUpMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("pb_form") || "{}");
      if (v.marker) setMarker(v.marker);
      if (v.stage) setStage(v.stage);
      if (v.rawImage) setRawImage(v.rawImage);
      if (typeof v.timepoint === "number") setTimepoint(v.timepoint);
      if (v.workDir) setWorkDir(v.workDir);
      if (v.mode) setMode(v.mode);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("pb_form", JSON.stringify({ marker, stage, rawImage, timepoint, workDir, mode })); } catch {}
  }, [marker, stage, rawImage, timepoint, workDir, mode]);

  async function load() {
    const { data: c } = await supabase.from("classifiers")
      .select("marker,stage,trained,notes,ilp_path").eq("active", true).order("marker");
    const { data: j } = await supabase.from("jobs")
      .select("id,run_id,step,capability,status,logs").order("created_at", { ascending: true });
    const { data: a } = await supabase.from("artifacts").select("job_id,kind,path,meta");
    setClassifiers(c ?? []); setJobs(j ?? []); setArtifacts(a ?? []);
    if (!marker && c && c.length) setMarker(c[0].marker);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "artifacts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "classifiers" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line

  const markers = Array.from(new Set(classifiers.map((c) => c.marker)));
  const stagesFor = (m: string) => Array.from(new Set(classifiers.filter((c) => c.marker === m).map((c) => c.stage)));
  // keep stage valid for the chosen marker
  useEffect(() => {
    const st = stagesFor(marker);
    if (marker && st.length && !st.includes(stage)) setStage(st[0]);
  }, [marker, classifiers]); // eslint-disable-line

  async function runPipeline() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marker, stage, rawImage, timepoint, workDir, mode }),
    });
    const out = await res.json();
    setMsg(res.ok ? (out.warning ? `Queued ⚠ ${out.warning}` : `Queued ✓ (${out.mode})`) : `Error: ${out.error}`);
    await load(); setBusy(false);
  }

  async function uploadClassifier() {
    const f = fileRef.current?.files?.[0];
    if (!f || !upMarker.trim()) { setUpMsg("Pick a .ilp file and enter a marker."); return; }
    setUploading(true); setUpMsg(null);
    const fd = new FormData();
    fd.append("file", f); fd.append("marker", upMarker.trim());
    fd.append("stage", upStage.trim()); fd.append("channel", String(upChannel));
    const res = await fetch("/api/classifiers", { method: "POST", body: fd });
    const out = await res.json();
    setUpMsg(res.ok ? `Uploaded ${out.sizeMB} MB ✓ — ${upMarker} @ ${upStage || "(no stage)"}` : `Error: ${out.error}`);
    if (res.ok && fileRef.current) fileRef.current.value = "";
    await load(); setUploading(false);
  }

  const runIds = (Array.from(new Set(jobs.map((j) => j.run_id).filter(Boolean))) as string[]).reverse();
  const selected = classifiers.find((c) => c.marker === marker && c.stage === stage);

  return (
    <div>
      <div style={card}>
        <h2 style={h2}>Run</h2>
        <div style={grid}>
          <label>Marker</label>
          <select value={marker} onChange={(e) => setMarker(e.target.value)} style={input}>
            {markers.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <label>Stage</label>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={input}>
            {stagesFor(marker).map((s) => (<option key={s} value={s}>{s || "(no stage)"}</option>))}
          </select>
          <label>Raw image</label>
          <input value={rawImage} onChange={(e) => setRawImage(e.target.value)} placeholder="/mnt/crunch/.../TP0_pMyo_crop.tif" style={input} />
          <label>Timepoint</label>
          <input type="number" value={timepoint} onChange={(e) => setTimepoint(Number(e.target.value))} style={input} />
          <label>Output dir</label>
          <input value={workDir} onChange={(e) => setWorkDir(e.target.value)} style={input} />
          <label>Output</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={input}>
            <option value="mesh">Mesh only — download the .obj (do the pullback in Blender)</option>
            <option value="pullback">Full pullback (experimental)</option>
          </select>
        </div>
        {selected && !selected.trained && (
          <p style={{ color: "#f59e0b", fontSize: 13, marginTop: 10 }}>⚠ {selected.marker} @ {selected.stage} isn’t fully trained — upload a trained .ilp below.</p>
        )}
        {marker && !selected && (
          <p style={{ color: "#f59e0b", fontSize: 13, marginTop: 10 }}>⚠ No classifier for {marker} @ {stage || "this stage"} — upload one below.</p>
        )}
        <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={runPipeline} disabled={busy || !rawImage || !marker} style={btn}>
            {busy ? "Queuing…" : mode === "mesh" ? "▶ Generate mesh" : "▶ Run pullback"}
          </button>
          {msg && <span style={dim}>{msg}</span>}
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Classifier library</h2>
        {classifiers.length === 0 && <p style={dim}>None yet. Upload a trained .ilp below.</p>}
        {classifiers.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
            <strong style={{ minWidth: 70 }}>{c.marker}</strong>
            <span style={{ ...pill, borderColor: "#3b82f6", color: "#93c5fd", minWidth: 50, textAlign: "center" }}>{c.stage || "—"}</span>
            <span style={{ ...pill, borderColor: c.trained ? "#22c55e" : "#f59e0b", color: c.trained ? "#22c55e" : "#f59e0b" }}>{c.trained ? "trained" : "not trained"}</span>
            <code style={{ color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ilp_path}</code>
          </div>
        ))}
        <div style={{ borderTop: "1px solid #1f2633", marginTop: 12, paddingTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".ilp,.ilp2" style={{ color: "#cbd5e1", fontSize: 13 }} />
          <input value={upMarker} onChange={(e) => setUpMarker(e.target.value)} placeholder="marker" style={{ ...input, width: 110 }} />
          <input value={upStage} onChange={(e) => setUpStage(e.target.value)} placeholder="stage (e.g. 6hpf)" style={{ ...input, width: 130 }} />
          <input type="number" value={upChannel} onChange={(e) => setUpChannel(Number(e.target.value))} title="channel" style={{ ...input, width: 65 }} />
          <button onClick={uploadClassifier} disabled={uploading} style={btn}>{uploading ? "Uploading…" : "⬆ Upload .ilp"}</button>
          {upMsg && <span style={dim}>{upMsg}</span>}
        </div>
      </div>

      {runIds.length === 0 && <p style={dim}>No runs yet.</p>}
      {runIds.map((rid) => {
        const rj = jobs.filter((j) => j.run_id === rid).sort((a, b) => STEP_ORDER.indexOf(a.capability) - STEP_ORDER.indexOf(b.capability));
        const meshJob = rj.find((j) => j.capability === "mesh");
        const meshArt = meshJob && artifacts.find((a) => a.job_id === meshJob.id && a.kind === "mesh");
        const meshUrl = meshArt?.meta?.download_url as string | undefined;
        const meshName = (meshArt?.path?.split("/").pop()) || "mesh.obj";
        const pullJob = rj.find((j) => j.capability === "pullback");
        const pull = pullJob && artifacts.find((a) => a.job_id === pullJob.id && a.kind === "pullback");
        return (
          <div key={rid} style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rj.map((j) => (
                <span key={j.id} title={j.logs ?? ""} style={{ ...pill, borderColor: STATUS_COLOR[j.status] ?? "#6b7280", color: STATUS_COLOR[j.status] ?? "#6b7280" }}>{j.capability} · {j.status}</span>
              ))}
            </div>
            {meshUrl && (
              <p style={{ marginTop: 12 }}>
                <a href={meshUrl + (meshUrl.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(meshName)} style={{ color: "#3b82f6", fontWeight: 600, textDecoration: "none" }}>⬇ Download {meshName}</a>
                <span style={{ ...dim, marginLeft: 10 }}>then UV + pullback in Blender</span>
              </p>
            )}
            {pull && <p style={{ color: "#22c55e", fontSize: 13, marginTop: 8 }}>✓ Pullback: <code style={{ color: "#cbd5e1" }}>{pull.path}</code></p>}
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid #1f2633", borderRadius: 10, padding: 16, marginBottom: 12, background: "#11151f" };
const h2: React.CSSProperties = { margin: "0 0 14px", fontSize: 18 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" };
const btn: React.CSSProperties = { background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14 };
const pill: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12 };
const input: React.CSSProperties = { background: "#0b0e14", color: "#e5e7eb", border: "1px solid #1f2633", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const dim: React.CSSProperties = { color: "#8a93a6", fontSize: 14 };
