#!/usr/bin/env python3
"""
Germ-Layer Pullback Pipeline — worker agent.

The SAME script runs on every machine (school/Ilastik, Mike/Blender, Fiji box).
What a machine can do is set by `capabilities` in its config file. The agent:

  1. registers itself in `machines` and sends heartbeats,
  2. polls Supabase's claim_job() RPC for the next runnable job matching its capabilities,
  3. runs the matching step runner (headless),
  4. records artifacts + marks the job done (or failed), which unblocks the next step.

Usage:
    python worker.py --config config.toml
"""
from __future__ import annotations
import argparse
import socket
import sys
import time
import traceback
from datetime import datetime, timezone

try:
    import tomllib  # py3.11+
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # pip install tomli on 3.10

from supabase import create_client, Client

from steps import RUNNERS  # capability -> callable(job, ctx) -> result dict


POLL_SECONDS = 5
HEARTBEAT_SECONDS = 30


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_config(path: str) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


class Worker:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.name: str = cfg["machine"]["name"]
        self.caps: list[str] = cfg["machine"]["capabilities"]
        self.sb: Client = create_client(
            cfg["supabase"]["url"], cfg["supabase"]["service_role_key"]
        )
        self.machine_id: str | None = None
        self._last_heartbeat = 0.0

    # -- registration / heartbeat -------------------------------------------
    def register(self) -> None:
        row = {
            "name": self.name,
            "capabilities": self.caps,
            "os": sys.platform,
            "last_heartbeat": now_iso(),
        }
        res = (
            self.sb.table("machines")
            .upsert(row, on_conflict="name")
            .execute()
        )
        self.machine_id = res.data[0]["id"]
        print(f"[{self.name}] registered  caps={self.caps}  id={self.machine_id}")

    def heartbeat(self) -> None:
        if time.time() - self._last_heartbeat < HEARTBEAT_SECONDS:
            return
        self.sb.table("machines").update({"last_heartbeat": now_iso()}).eq(
            "id", self.machine_id
        ).execute()
        self._last_heartbeat = time.time()

    # -- the loop ------------------------------------------------------------
    def claim(self) -> dict | None:
        res = self.sb.rpc(
            "claim_job", {"p_machine_id": self.machine_id, "p_caps": self.caps}
        ).execute()
        data = res.data
        if not data:
            return None
        # rpc returning a single composite row may come back as dict or [dict]
        return data[0] if isinstance(data, list) else data

    def log(self, job_id: str, msg: str) -> None:
        print(f"  · {msg}")
        # append to the job log so the dashboard shows progress live
        self.sb.rpc  # (kept simple: read-modify-write is fine at this volume)
        cur = self.sb.table("jobs").select("logs").eq("id", job_id).single().execute()
        logs = (cur.data.get("logs") or "") + f"[{now_iso()}] {msg}\n"
        self.sb.table("jobs").update({"logs": logs}).eq("id", job_id).execute()

    def finish(self, job_id: str, movie_id: str, result: dict) -> None:
        self.sb.table("jobs").update(
            {"status": "done", "result": result, "finished_at": now_iso()}
        ).eq("id", job_id).execute()
        # record artifacts the step produced
        for art in result.get("artifacts", []):
            self.sb.table("artifacts").insert(
                {"job_id": job_id, "movie_id": movie_id, **art}
            ).execute()

    def fail(self, job_id: str, err: str) -> None:
        self.sb.table("jobs").update(
            {"status": "failed", "logs": err, "finished_at": now_iso()}
        ).eq("id", job_id).execute()

    def run_job(self, job: dict) -> None:
        cap = job["capability"]
        runner = RUNNERS.get(cap)
        print(f"[{self.name}] claimed job {job['id']}  step={job['step']}  cap={cap}")
        if runner is None:
            self.fail(job["id"], f"No runner registered for capability '{cap}'")
            return
        ctx = {
            "config": self.cfg,
            "log": lambda m, jid=job["id"]: self.log(jid, m),
            "supabase": self.sb,
        }
        try:
            result = runner(job, ctx) or {}
            self.finish(job["id"], job["movie_id"], result)
            print(f"[{self.name}] done {job['id']}")
        except Exception:
            err = traceback.format_exc()
            self.fail(job["id"], err)
            print(f"[{self.name}] FAILED {job['id']}\n{err}")

    def loop(self) -> None:
        self.register()
        print(f"[{self.name}] polling every {POLL_SECONDS}s …  (Ctrl-C to stop)")
        while True:
            try:
                self.heartbeat()
                job = self.claim()
                if job:
                    self.run_job(job)
                else:
                    time.sleep(POLL_SECONDS)
            except KeyboardInterrupt:
                print(f"\n[{self.name}] shutting down")
                return
            except Exception:
                traceback.print_exc()
                time.sleep(POLL_SECONDS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.toml")
    args = ap.parse_args()
    cfg = load_config(args.config)
    cfg.setdefault("machine", {}).setdefault("name", socket.gethostname())
    Worker(cfg).loop()


if __name__ == "__main__":
    main()
