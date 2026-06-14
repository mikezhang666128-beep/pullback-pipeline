import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const BUCKET = "classifiers";
const PREFIX = `storage://${BUCKET}/`;

// POST: upload a trained .ilp and register it as the active classifier for marker+stage.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const marker = String(form.get("marker") ?? "").trim();
  const stage = String(form.get("stage") ?? "").trim();
  const channel = Number(form.get("channel") ?? 0);

  if (!file || !marker) return NextResponse.json({ error: "file and marker are required" }, { status: 400 });
  if (!/\.ilp\d*$/i.test(file.name)) return NextResponse.json({ error: "expected a .ilp file" }, { status: 400 });

  const key = `${marker}/${stage || "default"}/${file.name}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(key, buf, {
    upsert: true, contentType: "application/octet-stream",
  });
  if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });

  // swap: deactivate the current active classifier for this marker+stage
  await admin.from("classifiers").update({ active: false })
    .eq("marker", marker).eq("stage", stage).eq("active", true);
  const ilp_path = `${PREFIX}${key}`;
  const { error: insErr } = await admin.from("classifiers").insert({
    marker, stage, ilp_path, channel, trained: true, active: true,
    notes: `Uploaded ${file.name} (${(buf.length / 1e6).toFixed(2)} MB)`,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, ilp_path, sizeMB: +(buf.length / 1e6).toFixed(2) });
}

// DELETE: remove all classifiers for a marker+stage (+ their uploaded files).
export async function DELETE(req: NextRequest) {
  const { marker, stage } = await req.json();
  if (!marker) return NextResponse.json({ error: "marker required" }, { status: 400 });
  const st = stage ?? "";
  const { data: rows } = await admin.from("classifiers")
    .select("id, ilp_path").eq("marker", marker).eq("stage", st);
  const keys = (rows ?? [])
    .filter((r) => typeof r.ilp_path === "string" && r.ilp_path.startsWith(PREFIX))
    .map((r) => (r.ilp_path as string).slice(PREFIX.length));
  if (keys.length) await admin.storage.from(BUCKET).remove(keys);
  await admin.from("classifiers").delete().eq("marker", marker).eq("stage", st);
  return NextResponse.json({ ok: true, deleted: rows?.length ?? 0 });
}
