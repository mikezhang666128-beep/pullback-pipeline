"""
Storage abstraction so the file-handoff choice (ARCHITECTURE.md §4) is one config
switch, not a rewrite. Steps call resolve()/publish() instead of hard-coding paths.
"""
from __future__ import annotations
import os
import shutil
from pathlib import Path


class Storage:
    def __init__(self, cfg: dict):
        self.cfg = cfg.get("storage", {})
        self.backend = self.cfg.get("backend", "shared")
        self.shared_root = self.cfg.get("shared_root", "")

    def resolve(self, logical_path: str) -> str:
        """Turn a logical artifact path into a concrete path on THIS machine."""
        if self.backend == "shared":
            # logical paths are relative to the shared root
            return str(Path(self.shared_root) / logical_path)
        # supabase backend: download to a local scratch dir, return local path
        local = Path(os.getenv("TEMP", "/tmp")) / "pullback_cache" / logical_path
        local.parent.mkdir(parents=True, exist_ok=True)
        if not local.exists():
            self._download(logical_path, local)
        return str(local)

    def publish(self, local_path: str, logical_path: str) -> str:
        """Make a freshly produced file available to other machines. Returns logical path."""
        if self.backend == "shared":
            dst = Path(self.shared_root) / logical_path
            dst.parent.mkdir(parents=True, exist_ok=True)
            if Path(local_path).resolve() != dst.resolve():
                shutil.copy2(local_path, dst)
            return logical_path
        self._upload(local_path, logical_path)
        return logical_path

    # --- supabase backend hooks (wire up when/if you choose it) -------------
    def _download(self, logical_path: str, dst: Path) -> None:
        raise NotImplementedError("Supabase Storage backend not wired yet — see §4")

    def _upload(self, local_path: str, logical_path: str) -> None:
        raise NotImplementedError("Supabase Storage backend not wired yet — see §4")
