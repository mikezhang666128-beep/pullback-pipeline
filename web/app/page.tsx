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
const Clock = () => (<svg {...I()}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const Info = () => (<svg {...I()}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
const Trophy = () => (<svg {...I()}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></svg>);

function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function runTiming(rj: Job[]) {
  const created = rj.map((j) => Date.parse(j.created_at)).filter((x) => !isNaN(x));
  const start = created.length ? Math.min(...created) : Date.now();
  const anyFailed = rj.some((j) => j.status === "failed");
  const allDone = rj.length > 0 && rj.every((j) => j.status === "done");
  let end: number | null = null;
  if (allDone || anyFailed) {
    const fins = rj.map((j) => Date.parse(j.finished_at || "")).filter((x) => !isNaN(x));
    end = fins.length ? Math.max(...fins) : start;
  }
  return { state: (anyFailed ? "failed" : allDone ? "done" : "running") as "failed" | "done" | "running", start, end };
}

/* ---------------- types ---------------- */
type Classifier = { marker: string; stage: string; trained: boolean; ilp_path: string };
type Job = { id: string; run_id: string | null; capability: string; status: string; logs: string | null; created_at: string; started_at: string | null; finished_at: string | null };
type Artifact = { job_id: string; kind: string; path: string; meta: any };
const STATUS_COLOR: Record<string, string> = { queued: "var(--color-muted)", blocked: "var(--color-muted)", running: "var(--color-accent)", done: "var(--color-success)", failed: "var(--color-danger)", canceled: "var(--color-muted)" };
type Machine = { name: string; capabilities: string[]; os: string | null; last_heartbeat: string | null };
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
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
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
        {err && <span style={{ color: "var(--color-warning)", fontSize: 13 }}>{err}</span>}
        <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
          style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: 13 }}>
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <p style={{ textAlign: "center", color: "var(--color-muted)", fontSize: 12, marginTop: 14, marginBottom: 0 }}>
          built by Mike &middot; powered by laziness &amp; not wanting to open VNC
        </p>
      </div>
    </div>
  );
}

/* ================= App ================= */
function App({ user }: { user: any }) {
  const userTag = (user.email?.split("@")[0] || user.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [workerOpen, setWorkerOpen] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [pSaving, setPSaving] = useState(false);
  const [pMsg, setPMsg] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const avatarRef = useRef<HTMLInputElement>(null);

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
  useEffect(() => {
    const m = rawImage.match(/TP(\d+)/i);
    if (m) setTimepoint(Number(m[1]));
  }, [rawImage]);

  useEffect(() => {
    supabase.from("profiles").select("name,description,avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) { setPName(data.name || ""); setPDesc(data.description || ""); setMyAvatar(data.avatar_url || null); } });
  }, []); // eslint-disable-line

  async function saveProfile() {
    setPSaving(true); setPMsg(null);
    const fd = new FormData();
    fd.append("userId", user.id); fd.append("name", pName); fd.append("description", pDesc);
    const file = avatarRef.current?.files?.[0]; if (file) fd.append("file", file);
    const res = await fetch("/api/profile", { method: "POST", body: fd });
    const out = await res.json();
    if (res.ok) { if (out.avatar_url) setMyAvatar(out.avatar_url); setPMsg("Saved"); setProfileVersion((v) => v + 1); if (avatarRef.current) avatarRef.current.value = ""; }
    else setPMsg("Error: " + out.error);
    setPSaving(false);
  }

  async function load() {
    const { data: c } = await supabase.from("classifiers").select("marker,stage,trained,ilp_path").eq("active", true).order("marker");
    const { data: j } = await supabase.from("jobs").select("id,run_id,capability,status,logs,created_at,started_at,finished_at").order("created_at", { ascending: true });
    const { data: a } = await supabase.from("artifacts").select("job_id,kind,path,meta");
    const { data: m } = await supabase.from("machines").select("name,capabilities,os,last_heartbeat");
    setClassifiers(c ?? []); setJobs(j ?? []); setArtifacts(a ?? []); setMachines(m ?? []);
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

  // live clock for timers + a poll fallback so progress updates without refreshing
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => load(), 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
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

  // worker status: a box is "online" if it sent a heartbeat in the last 75s (worker beats every 30s)
  const liveWorkers = machines.filter((m) => m.last_heartbeat && now - Date.parse(m.last_heartbeat) < 75000);
  const workerOnline = liveWorkers.length > 0;
  const workerBusy = workerOnline && jobs.some((j) => j.status === "running");
  const wColor = workerOnline ? "var(--color-success)" : "var(--color-muted)";
  const wLabel = !workerOnline ? "Worker offline" : workerBusy ? "Worker working" : "Worker online";
  const wTitle = machines.length
    ? machines.map((m) => `${m.name}: ${m.last_heartbeat ? Math.round((now - Date.parse(m.last_heartbeat)) / 1000) + "s ago" : "no heartbeat"}`).join("\n")
    : "no workers registered";
  const runIds = (Array.from(new Set(jobs.map((j) => j.run_id).filter(Boolean))) as string[]).reverse();
  const selected = classifiers.find((c) => c.marker === marker && c.stage === stage);
  const noStages = marker && stagesFor(marker).length === 0;

  // library grouped by marker, filtered
  const fq = filter.trim().toLowerCase();
  const libMarkers = markers.filter((m) => !fq || m.toLowerCase().includes(fq) || stagesFor(m).some((s) => s.toLowerCase().includes(fq)));

  return (
    <div>
      {/* top bar */}
      <style>{`@keyframes wpulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div title={wTitle} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-foreground)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: wColor, boxShadow: workerOnline ? `0 0 7px ${wColor}` : "none", animation: workerBusy ? "wpulse 1.1s ease-in-out infinite" : "none" }} />
          {wLabel}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {myAvatar && <img src={myAvatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--color-line)" }} />}
          <span style={dim}>{pName || user.email}</span>
          <button onClick={() => setProfileOpen(!profileOpen)} style={ghost}>Profile</button>
          <button onClick={() => supabase.auth.signOut()} style={{ ...ghost, display: "inline-flex", alignItems: "center", gap: 6 }}><Out /> Sign out</button>
        </div>
      </div>
      {profileOpen && (
        <div style={card}>
          <h2 style={h2}>Your profile</h2>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 76, height: 76, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--color-line)", background: "var(--color-base)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {myAvatar ? <img src={myAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ ...dim, fontSize: 11 }}>no pic</span>}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" style={{ fontSize: 11, color: "var(--color-foreground)", marginTop: 8, width: 134 }} />
            </div>
            <div style={{ flex: 1, minWidth: 220, display: "grid", gap: 8 }}>
              <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="display name" style={input} />
              <textarea value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="short description (role, fun fact...)" rows={3} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={saveProfile} disabled={pSaving} style={btn}>{pSaving ? "Saving..." : "Save profile"}</button>
                {pMsg && <span style={dim}>{pMsg}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 18, alignItems: "center", margin: "2px 4px 14px", fontSize: 13 }}>
        <a href="/guide" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}><Info /> How to use &amp; worker guide &rarr;</a>
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
              const sel = s === stage; const col = c?.trained ? "var(--color-success)" : "var(--color-warning)";
              return (
                <button key={s} onClick={() => setStage(s)} style={{ ...chip, borderColor: col, color: sel ? "var(--color-base)" : col, background: sel ? col : "transparent", fontWeight: sel ? 700 : 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {s || "—"} {c?.trained ? <Check /> : <span style={{ fontSize: 11 }}>untrained</span>}
                </button>
              );
            })}
            {noStages && <span style={dim}>no classifier yet — add one in the library below</span>}
          </div>
          <label>Raw image</label>
          <div>
            <input value={rawImage} onChange={(e) => setRawImage(e.target.value)} placeholder="/mnt/crunch/.../TP0_pMyo_crop.tif" style={{ ...input, width: "100%", boxSizing: "border-box" }} />
            <div style={{ fontSize: 11.5, color: "var(--color-muted)", fontWeight: 700, marginTop: 4 }}>The file must be on a drive shared with qbio-vip10 (e.g. crunch). Paste its full path &mdash; the file itself isn&rsquo;t uploaded.</div>
          </div>
          <label>Timepoint</label>
          <input type="number" value={timepoint} onChange={(e) => setTimepoint(Number(e.target.value))} style={input} />
          <label>Output dir</label>
          <div>
            <input value={workDir} readOnly style={{ ...input, width: "100%", boxSizing: "border-box", color: "var(--color-muted)", cursor: "not-allowed" }} />
            <div style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 4 }}>Results go to your own folder automatically.</div>
          </div>
          <label>Output</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={input}>
            <option value="mesh">Mesh only — download the .obj (do the pullback in Blender)</option>
            <option value="pullback">Full pullback (experimental)</option>
          </select>
        </div>
        {selected && !selected.trained && (<p style={{ color: "var(--color-warning)", fontSize: 13, marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}><Warn /> {selected.marker} @ {selected.stage} isn’t fully trained — results may be poor.</p>)}
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
          <span style={{ ...pill, borderColor: "var(--color-line)", color: "var(--color-muted)" }}>{classifiers.length}</span>
        </div>
        {libOpen && (
          <div style={{ marginTop: 14 }}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter marker or stage…" style={{ ...input, width: "100%", marginBottom: 12 }} />
            {libMarkers.length === 0 && <p style={dim}>No classifiers. Add one below.</p>}
            {libMarkers.map((m) => {
              const open = expanded[m] ?? true;
              const sts = stagesFor(m).filter((s) => !fq || m.toLowerCase().includes(fq) || s.toLowerCase().includes(fq));
              return (
                <div key={m} style={{ borderBottom: "1px solid var(--color-line)", paddingBottom: 8, marginBottom: 8 }}>
                  <div onClick={() => setExpanded({ ...expanded, [m]: !open })} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                    <Chevron open={open} />
                    <strong>{m}</strong>
                    <span style={dim}>{sts.length} stage{sts.length === 1 ? "" : "s"}</span>
                  </div>
                  {open && sts.map((s) => {
                    const c = classifiers.find((x) => x.marker === m && x.stage === s)!;
                    return (
                      <div key={s} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0 4px 28px" }}>
                        <span style={{ ...pill, borderColor: "var(--color-accent)", color: "var(--color-accent)", minWidth: 46, textAlign: "center" }}>{s || "—"}</span>
                        <span style={{ ...pill, borderColor: c.trained ? "var(--color-success)" : "var(--color-warning)", color: c.trained ? "var(--color-success)" : "var(--color-warning)" }}>{c.trained ? "trained" : "untrained"}</span>
                        <code style={{ flex: 1, color: "var(--color-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ilp_path}</code>
                        <button onClick={() => deleteClassifier(m, s)} title="delete" style={delBtn}><X /></button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-muted)", marginBottom: 8 }}>Upload / swap a trained classifier:</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".ilp,.ilp2" style={{ color: "var(--color-foreground)", fontSize: 13 }} />
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
      {(showAllRuns ? runIds : runIds.slice(0, 1)).map((rid) => {
        const rj = jobs.filter((j) => j.run_id === rid).sort((a, b) => STEP_ORDER.indexOf(a.capability) - STEP_ORDER.indexOf(b.capability));
        const meshJob = rj.find((j) => j.capability === "mesh");
        const meshArt = meshJob && artifacts.find((a) => a.job_id === meshJob.id && a.kind === "mesh");
        const meshUrl = meshArt?.meta?.download_url as string | undefined;
        const meshName = (meshArt?.path?.split("/").pop()) || "mesh.obj";
        const tm = runTiming(rj);
        const elapsed = fmtDur((tm.end ?? now) - tm.start);
        const tcol = tm.state === "running" ? "var(--color-accent)" : tm.state === "done" ? "var(--color-success)" : "var(--color-danger)";
        const tlabel = tm.state === "running" ? `running ${elapsed}` : tm.state === "done" ? `done in ${elapsed}` : `failed after ${elapsed}`;
        return (
          <div key={rid} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {rj.map((j) => (<span key={j.id} title={j.logs ?? ""} style={{ ...pill, borderColor: STATUS_COLOR[j.status] ?? "var(--color-muted)", color: STATUS_COLOR[j.status] ?? "var(--color-muted)" }}>{j.capability} · {j.status}</span>))}
              </div>
              <span style={{ ...pill, borderColor: tcol, color: tcol, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><Clock /> {tlabel}</span>
            </div>
            {meshUrl && (
              <p style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7 }}>
                <a href={meshUrl + (meshUrl.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(meshName)} style={{ color: "var(--color-accent)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><Down /> Download {meshName}</a>
                <span style={dim}>then UV + pullback in Blender</span>
              </p>
            )}
          </div>
        );
      })}
      {runIds.length > 1 && (
        <button onClick={() => setShowAllRuns(!showAllRuns)} style={{ ...ghost, marginTop: 4 }}>
          {showAllRuns ? "Show less" : `Show all ${runIds.length} runs`}
        </button>
      )}

      <Games user={user} pv={profileVersion} />
    </div>
  );
}

function Games({ user, pv }: { user: any; pv: number }) {
  const GAMES: Record<string, { src: string; name: string }> = {
    fish:  { src: "/fish-game.html",  name: "Zebrafish Runner" },
    chase: { src: "/chase-game.html", name: "Don't Get Chased by Streichan" },
  };
  const [bests, setBests] = useState<Record<string, number>>({ fish: 0, chase: 0 });
  const [lb, setLb] = useState<any[]>([]);
  const [profs, setProfs] = useState<Record<string, any>>({});
  const [sel, setSel] = useState<string>("fish");
  const ref = useRef<HTMLIFrameElement>(null);

  async function loadAll() {
    const { data: mine } = await supabase.from("game_scores").select("game,best").eq("user_id", user.id);
    const b: Record<string, number> = { fish: 0, chase: 0 };
    (mine ?? []).forEach((r: any) => { b[r.game] = r.best; });
    setBests(b);
    const { data: all } = await supabase.from("game_scores").select("user_id,game,best").order("best", { ascending: false });
    setLb(all ?? []);
    const { data: pr } = await supabase.from("profiles").select("user_id,name,avatar_url");
    const m: Record<string, any> = {}; (pr ?? []).forEach((p: any) => { m[p.user_id] = p; });
    setProfs(m);
  }
  useEffect(() => { loadAll(); }, [pv]); // eslint-disable-line

  function postBest() { ref.current?.contentWindow?.postMessage({ type: "best", best: bests[sel] || 0 }, "*"); }
  useEffect(() => { postBest(); }, [bests, sel]); // eslint-disable-line

  useEffect(() => {
    async function onMsg(e: MessageEvent) {
      const d: any = e.data;
      if (!d || !d.game) return;
      if (d.type === "ready") { postBest(); }
      else if (d.type === "gameover") {
        const sc = Math.floor(d.score || 0);
        if (sc > (bests[d.game] || 0)) {
          setBests({ ...bests, [d.game]: sc });
          await supabase.from("game_scores").upsert(
            { user_id: user.id, game: d.game, best: sc, name: (user.email?.split("@")[0] || "anon"), updated_at: new Date().toISOString() },
            { onConflict: "user_id,game" });
          loadAll();
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [bests, sel]); // eslint-disable-line

  const fullList = lb.filter((r) => r.game === sel);
  const rows = fullList.slice(0, 6);
  const myRank = fullList.findIndex((r) => r.user_id === user.id) + 1;
  const nameOf = (uid: string) => profs[uid]?.name || "anon";

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ ...h2, fontSize: 14, color: "var(--color-muted)", marginBottom: 10 }}>While you wait &mdash; pick a game, beat the lab</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {Object.keys(GAMES).map((g) => {
          const active = sel === g;
          return (
            <button key={g} onClick={() => setSel(g)} style={{
              ...chip, borderColor: active ? "var(--color-primary)" : "var(--color-line)",
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "var(--color-on-primary)" : "var(--color-foreground)", fontWeight: active ? 700 : 500,
            }}>{GAMES[g].name} &middot; best {bests[g] || 0}</button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 190px", gap: 12, alignItems: "start" }}>
        <iframe ref={ref} key={sel} src={GAMES[sel].src} title={GAMES[sel].name} scrolling="no" onLoad={postBest}
          style={{ width: "100%", height: 430, border: "1px solid var(--color-line)", borderRadius: 12, background: "var(--color-base)" }} />
        <div style={{ ...card, marginBottom: 0, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--color-warning)", fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
            <Trophy /> Leaderboard
          </div>
          <div style={{ ...dim, fontSize: 12, marginBottom: 8 }}>
            {myRank > 0 ? `you're #${myRank} of ${fullList.length}` : "no score yet"}
          </div>
          {rows.length === 0 && <div style={dim}>No scores yet &mdash; be the first!</div>}
          {rows.map((r, i) => {
            const me = r.user_id === user.id;
            const av = profs[r.user_id]?.avatar_url;
            return (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0", fontSize: 12,
                color: me ? "var(--color-accent)" : "var(--color-foreground)", fontWeight: me ? 700 : 400 }}>
                <span style={{ width: 16, color: i < 3 ? "var(--color-warning)" : "var(--color-muted)" }}>#{i + 1}</span>
                {av ? <img src={av} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
                    : <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--color-line)", display: "inline-block" }} />}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.user_id)}{me ? " (you)" : ""}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.best}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid var(--color-line)", borderRadius: 10, padding: 16, marginBottom: 12, background: "var(--color-surface)" };
const h2: React.CSSProperties = { margin: "0 0 14px", fontSize: 18 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" };
const btn: React.CSSProperties = { background: "var(--color-primary)", color: "var(--color-on-primary)", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 14 };
const ghost: React.CSSProperties = { background: "transparent", color: "var(--color-muted)", border: "1px solid var(--color-line)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13 };
const delBtn: React.CSSProperties = { background: "transparent", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: 6, padding: "3px 7px", cursor: "pointer", display: "inline-flex" };
const pill: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12 };
const chip: React.CSSProperties = { border: "1px solid", borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer" };
const input: React.CSSProperties = { background: "var(--color-base)", color: "var(--color-foreground)", border: "1px solid var(--color-line)", borderRadius: 8, padding: "8px 10px", fontSize: 14 };
const pre: React.CSSProperties = { background: "var(--color-base)", border: "1px solid var(--color-line)", borderRadius: 8, padding: "10px 12px", overflowX: "auto", fontSize: 12, color: "var(--color-foreground)", whiteSpace: "pre", margin: 0 };
const dim: React.CSSProperties = { color: "var(--color-muted)", fontSize: 14 };
