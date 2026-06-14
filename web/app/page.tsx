"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Movie = { id: string; name: string; t_start: number; t_end: number };
type Job = {
  id: string; movie_id: string; step: string; capability: string;
  status: string; logs: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  queued: "#6b7280", blocked: "#6b7280", running: "#3b82f6",
  done: "#22c55e", failed: "#ef4444", canceled: "#6b7280",
};

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data: m } = await supabase.from("movies").select("id,name,t_start,t_end").order("name");
    const { data: j } = await supabase.from("jobs")
      .select("id,movie_id,step,capability,status,logs")
      .order("created_at", { ascending: true });
    setMovies(m ?? []);
    setJobs(j ?? []);
  }

  useEffect(() => {
    load();
    // live updates: any change to jobs re-renders the status
    const ch = supabase
      .channel("jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function runMovie(movieId: string) {
    setBusy(movieId);
    await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId }),
    });
    await load();
    setBusy(null);
  }

  return (
    <div>
      {movies.length === 0 && (
        <p style={{ color: "#8a93a6" }}>
          No movies yet. Run the Google-Sheet sync to populate them.
        </p>
      )}
      {movies.map((mv) => {
        const mvJobs = jobs.filter((j) => j.movie_id === mv.id);
        return (
          <div key={mv.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{mv.name}</strong>
                <span style={{ color: "#8a93a6", marginLeft: 10 }}>
                  TP {mv.t_start}–{mv.t_end}
                </span>
              </div>
              <button onClick={() => runMovie(mv.id)} disabled={busy === mv.id} style={btn}>
                {busy === mv.id ? "Queuing…" : "▶ Run pipeline"}
              </button>
            </div>
            {mvJobs.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {mvJobs.map((j) => (
                  <span key={j.id} title={j.logs ?? ""} style={{
                    ...pill, borderColor: STATUS_COLOR[j.status] ?? "#6b7280",
                    color: STATUS_COLOR[j.status] ?? "#6b7280",
                  }}>
                    {j.step} · {j.status}
                  </span>
                ))}
              </div>
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
  padding: "8px 14px", cursor: "pointer", fontSize: 14,
};
const pill: React.CSSProperties = {
  border: "1px solid", borderRadius: 999, padding: "3px 10px", fontSize: 12,
};
