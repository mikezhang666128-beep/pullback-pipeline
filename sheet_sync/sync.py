#!/usr/bin/env python3
"""
Sync the "Zebrafish Movie Information" Google Sheet -> Supabase `movies` table.

The professor keeps editing the Sheet (no change to her habits); this mirrors it into the
app. Run it on a schedule (Task Scheduler / cron) or trigger from the dashboard.

Setup:
  1. Google Cloud: create a Service Account, enable the Google Sheets API, download its
     JSON key. Share the Sheet with the service-account email (Viewer is enough).
  2. pip install gspread google-auth supabase
  3. Set env vars (or edit CONFIG below):
       GOOGLE_SA_JSON   path to the service-account key
       SHEET_ID         the Sheet's id (from its URL)
       SUPABASE_URL     your project URL
       SUPABASE_SERVICE_KEY  service-role key

Expected Sheet columns (header row, rename in COLUMN_MAP to match your actual headers):
   sheet_row_id | name | ch0_path | ch1_path | working_dir | ilp_path |
   t_start | t_end | t_step
"""
from __future__ import annotations
import os

import gspread
from google.oauth2.service_account import Credentials
from supabase import create_client

# --- config -----------------------------------------------------------------
GOOGLE_SA_JSON = os.environ["GOOGLE_SA_JSON"]
SHEET_ID = os.environ["SHEET_ID"]
WORKSHEET = os.environ.get("WORKSHEET", "Sheet1")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# Map Sheet header -> movies column. Edit the LEFT side to your real headers.
COLUMN_MAP = {
    "ID": "sheet_row_id",
    "Movie Name": "name",
    "Ch0 Path": "ch0_path",
    "Ch1 Path": "ch1_path",
    "Working Dir": "working_dir",
    "ILP Path": "ilp_path",
    "t_start": "t_start",
    "t_end": "t_end",
    "t_step": "t_step",
}
INT_COLS = {"t_start", "t_end", "t_step"}


def main() -> None:
    creds = Credentials.from_service_account_file(
        GOOGLE_SA_JSON,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    gc = gspread.authorize(creds)
    ws = gc.open_by_key(SHEET_ID).worksheet(WORKSHEET)
    rows = ws.get_all_records()  # list[dict] keyed by header

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    upserts = []
    for r in rows:
        movie = {}
        for sheet_col, db_col in COLUMN_MAP.items():
            val = r.get(sheet_col, "")
            if db_col in INT_COLS:
                val = int(val) if str(val).strip() else None
            movie[db_col] = val if val != "" else None
        if not movie.get("sheet_row_id") or not movie.get("name"):
            continue  # skip blank rows
        upserts.append(movie)

    if upserts:
        sb.table("movies").upsert(upserts, on_conflict="sheet_row_id").execute()
    print(f"Synced {len(upserts)} movies from the Sheet -> Supabase.")


if __name__ == "__main__":
    main()
