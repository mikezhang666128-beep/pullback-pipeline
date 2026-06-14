"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ---------------- SVG icons ---------------- */
const I = (p: any) => ({ width: 15, height: 15, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...p });
const Play = () => (<svg {...I()}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" /></svg>);
const Up = () => (<svg {...I()}><path d="M12 19V6M5 12l7-7 7 7" /></svg>);
const Down = () => (<svg {...I()}><path d="M12 5v13M5 12l7 7 7-7" /></svg>);
const X = () => (<svg {...I()}><path d="M18 6L6 18M6 6l12 12" /></svg>);
const Check = () => (<svg {...I()}><path d="M20 6L9 17l-5-5" /></svg>);
const Warn = () => (<svg {...I()}><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>);
const Chevron = ({ open }: { open: boolean }) => (<svg {...I({ style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" } })}><path d="M9 18l6-6-6-6" /></svg>);
const Out = () => (<svg {...I()}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>);

/* ---------------- types ---------------- */
type Classifier = { marker: string; stage: string; trained: boolean; ilp_path: string };
type Job = { id: string; run_id: string | null; capability: string; status: string; logs: string | null };
type Artifact = { job_id: string; kind: string; path: string; meta: any };
const STATUS_COLOR: Record<string, string> = { queued: "#9ca3af", blocked: "#6b7280", running: "#3b82f6", done: "#22c55e", failed: "#ef4444", canceled: "#6b7280" };
const STEP_ORDER = ["downsample", "ilastik_predict", "mesh", "pullback"];

/* ================= Auth gate ================= */
export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!ready) return <p style={dim}>Loading…</p>;
  if (!session) return <Login />;
  return <App user={session.user} />;
}

/* ================= Login ================= */
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr(null);
    const res = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw });
    if (res.error) setErr(res.error.message);
    else if (mode === "signup" && !res.data.session) setErr("Account created — check your email to confirm, then sign in.");
    setBusy(false);
  }
  return (
    <div style={{ ...card, maxWidth: 380, margin: "40px auto" }}>
      <h2 style={h2}>{mode === "signin" ? "Sign in" : "Create account"}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" style={input} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" type="password"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={input} />
        <button onClick={submit} disabled={busy || !email || !pw} style={btn}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        {err && <span style={{ color: "#f59e0b", fontSize: 13 }}>{err}</span>}
        <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
          style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13 }}>
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

/* ================= App ================= */
function App({ user }: { user: any }) {
  const userTag = (user.email?.split("@")[0] || user.id).replace(/[^a-zA-Z0-9_-]/g, "_");
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
  const [libOpen, setLibOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("pb_form") || "{}");
      if (v.marker) setMarker(v.marker); if (v.stage) setStage(v.stage);
      if (v.rawImage) setRawImage(v.rawImage);
      if (typeof v.timepoint === "number") setTimepoint(v.timepoint);
      if (v.workDir) setWorkDir(v.workDir); if (v.mode) setMode(v.mode);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("pb_form", JSON.stringify({ marker, stage, rawImage, timepoint, workDir, mode })); } catch {}
  }, [marker, stage, rawImage, timepoint, workDir, mode]);

  async function load() {
    const { data: c } = await supabase.from("classifiers").select("marker,stage,trained,ilp_path").eq("active", true).order("marker");
    const { data: j } = await supabase.from("jobs").select("id,run_id,capability,status,logs").order("created_at", { ascending: true });
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
  useEffect(() => { const st = stagesFor(marker); if (marker && st.length && !st.includes(stage)) setStage(st[0]); }, [marker, classifiers]); // eslint-disable-line

  async function runPipeline() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marker, stage, rawImage, timepoint, workDir, mode, userId: user.id, userTag }) });
    const out = await res.json();
    setMsg(res.ok ? (out.warning ? `Queued — ${out.warning}` : `Queued (${out.mode})`) : `Error: ${out.error}`);
    await load(); setBusy(false);
  }
  async function uploadClassifier() {
    const f = fileRef.current?.files?.[0];
    if (!f || !upMarker.trim()) { setUpMsg("Pick a .ilp and enter a marker."); return; }
    setUploading(true); setUpMsg(null);
    const fd = new FormData();
    fd.append("file", f); fd.append("marker", upMarker.trim()); fd.append("stage", upStage.trim()); fd.append("channel", String(upChannel));
    const res = await fetch("/api/classifiers", { method: "POST", body: fd });
    const out = await res.json();
    setUpMsg(res.ok ? `Uploaded ${out.sizeMB} MB — ${upMarker} @ ${upStage || "(no stage)"}` : `Error: ${out.error}`);
    if (res.ok && fileRef.current) fileRef.current.value = "";
    await load(); setUploading(false);
  }
  async function deleteClassifier(m: string, s: string) {
    if (!confirm(`Delete classifier  ${m} @ ${s || "(no stage)"} ?`)) return;
    await fetch("/api/classifiers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marker: m, stage: s }) });
    await load();
  }

  const runIds = (Array.from(new Set(jobs.map((j) => j.run_id).filter(Boolean))) as string[]).reverse();
  const selected = classifiers.find((c) => c.marker === marker && c.stage === stage);
  const noStages = marker && stagesFor(marker).length === 0;

  // library grouped by marker, filtered
  const fq = filter.trim().toLowerCase();
  const libMarkers = markers.filter((m) => !fq || m.toLowerCase().includes(fq) || stagesFor(m).some((s) => s.toLowerCase().includes(fq)));

  return (
    <div>
      {/* top bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={dim}>{user.email}</span>
        <button onClick={() => supabase.auth.signOut()} style={{ ...ghost, display: "inline-flex", alignItems: "center", gap: 6 }}><Out /> Sign out</button>
      </div>

      {/* Run */}
      <div style={card}>
        <h2 style={h2}>Run</h2>
        <div style={grid}>
          <label>Marker</label>
          <select value={marker} onChange={(e) => setMarker(e.target.value)} style={input}>
            {markers.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <label>Stage</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {stagesFor(marker).map((s) => {
              const c = classifiers.find((x) => x.marker === marker && x.stage === s);
              const sel = s === stage; const col = c?.trained ? "#22c55e" : "#f59e0b";
              return (
                <button key={s} onClick={() => setStage(s)} style={{ ...chip, borderColor: col, color: sel ? "#0b0e14" : col, background: sel ? col : "transparent", fontWeight: sel ? 700 : 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {s || "—"} {c?.trained ? <Check /> : <span style={{ fontSize: 11 }}>untrained</span>}
                </button>
              );
            })}
            {noStages && <span style={dim}>no classifier yet — add one in the library below</span>}
          </div>
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
        {selected && !selected.trained && (<p style={{ color: "#f59e0b", fontSize: 13, marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}><Warn /> {selected.marker} @ {selected.stage} isn’t fully trained — results may be poor.</p>)}
        <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={runPipeline} disabled={busy || !rawImage || !marker || !selected} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Play /> {busy ? "Queuing…" : mode === "mesh" ? "Generate mesh" : "Run pullback"}
          </button>
          {msg && <span style={dim}>{msg}</span>}
        </div>
      </div>

      {/* Classifier library — collapsible */}
      <div style={card}>
        <div onClick={() => setLibOpen(!libOpen)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <Chevron open={libOpen} />
          <h2 style={{ ...h2, margin: 0 }}>Classifier library</h2>
          <span style={{ ...pill, borderColor: "#334155", color: "#94a3b8" }}>{classifiers.length}</span>
        </div>
        {libOpen && (
          <div style={{ marginTop: 14 }}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter marker or stage…" style={{ ...input, width: "100%", marginBottom: 12 }} />
            {libMarkers.length === 0 && <p style={dim}>No classifiers. Add one below.</p>}
            {libMarkers.map((m) => {
              const open = expanded[m] ?? true;
              const sts = stagesFor(m).filter((s) => !fq || m.toLowerCase().includes(fq) || s.toLowerCase().includes(fq));
              return (
                <div key={m} style={{ borderBottom: "1px solid #1f2633", paddingBottom: 8, marginBottom: 8 }}>
                  <div onClick={() => setExpanded({ ...expanded, [m]: !open })} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                    <Chevron open={open} />
                    <strong>{m}</strong>
                    <span style={dim}>{sts.length} stage{sts.length === 1 ? "" : "s"}</span>
                  </div>
                  {open && sts.map((s) => {
                    const c = classifiers.find((x) => x.marker === m && x.stage === s)!;
                    return (
                      <div key={s} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0 4px 28px" }}>
                        <span style={{ ...pill, borderColor: "#3b82f6", color: "#93c5fd", minWidth: 46, textAlign: "center" }}>{s || "—"}</span>
                        <span style={{ ...pill, borderColor: c.trained ? "#22c55e" : "#f59e0b", color: c.trained ? "#22c55e" : "#f59e0b" }}>{c.trained ? "trained" : "untrained"}</span>
                        <code style={{ flex: 1, color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ilp_path}</code>
                        <button onClick={() => deleteClassifier(m, s)} title="delete" style={delBtn}><X /></button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", marginBottom: 8 }}>Upload / swap a trained classifier:</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".ilp,.ilp2" style={{ color: "#cbd5e1", fontSize: 13 }} />
              <input value={upMarker} onChange={(e) => setUpMarker(e.target.value)} placeholder="marker" style={{ ...input, width: 110 }} />
              <input value={upStage} onChange={(e) => setUpStage(e.target.value)} placeholder="stage (e.g. 6hpf)" style={{ ...input, width: 130 }} />
              <input type="number" value={upChannel} onChange={(e) => setUpChannel(Number(e.target.value))} title="channel" style={{ ...input, width: 65 }} />
              <button onClick={uploadClassifier} disabled={uploading} style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 7 }}><Up /> {uploading ? "Uploading…" : "Upload .ilp"}</button>
              {upMsg && <span style={dim}>{upMsg}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Your runs */}
      <h2 style={{ ...h2, fontSize: 16, margin: "18px 0 8px" }}>Your runs</h2>
      {runIds.length === 0 && <p style={dim}>No runs yet.</p>}
      {runIds.map((rid) => {
        const rj = jobs.filter((j) => j.run_id === rid).sort((a, b) => STEP_ORDER.indexOf(a.capability) - STEP_ORDER.indexOf(b.capability));
        const meshJob = rj.find((j) => j.capability === "mesh");
        const meshArt = meshJob && artifacts.find((a) => a.job_id === meshJob.id && a.kind === "mesh");
        const meshUrl = meshArt?.meta?.download_url as string | undefined;
        const meshName = (meshArt?.path?.split("/").pop()) || "mesh.obj";
        return (
          <div key={rid} style={card}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rj.map((j) => (<span key={j.id} title={j.logs ?? ""} style={{ ...pill, borderColor: STATUS_COLOR[j.status] ?? "#6b7280", color: STATUS_COLOR[j.status] ?? "#6b7280" }}>{j.capability} · {j.status}</span>))}
            </div>
            {meshUrl && (
              <p style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7 }}>
                <a href={meshUrl + (meshUrl.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(meshName)} style={{ color: "#3b82f6", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><Down /> Download {meshName}</a>
                <span style={dim}>then UV + pullback in Blender</span>
              </p>
            )}
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
const ghost: React.CSSProperties = { background: "transparent", color: "#8a93a6", border: "1px solid #1f2633", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13 };
const delBtn: React.CSSProperties = { background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6, padding: "3px 7px", cursor: "pointer", display: "inline-flex" };
const pill: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12 };
const chip: React.CSSProperties = { border: "1px solid", borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer" };
const input: React.CSSProperties = { background: "#0b0e14", color: "#e5e7eb", border: "1px solid #1f2633", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const dim: React.CSSProperties = { color: "#8a93a6", fontSize: 14 };
