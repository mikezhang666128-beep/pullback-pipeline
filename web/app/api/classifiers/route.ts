import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const BUCKET = "classifiers";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const marker = String(form.get("marker") ?? "").trim();
  const stage = String(form.get("stage") ?? "").trim();
  const channel = Number(form.get("channel") ?? 0);

  if (!file || !marker) {
    return NextResponse.json({ error: "file and marker are required" }, { status: 400 });
  }
  if (!/\.ilp\d*$/i.test(file.name)) {
    return NextResponse.json({ error: "expected a .ilp file" }, { status: 400 });
  }

  const key = `${marker}/${stage || "default"}/${file.name}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(key, buf, {
    upsert: true, contentType: "application/octet-stream",
  });
  if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });

  await admin.from("classifiers").update({ active: false })
    .eq("marker", marker).eq("stage", stage).eq("active", true);
  const ilp_path = `storage://${BUCKET}/${key}`;
  const { error: insErr } = await admin.from("classifiers").insert({
    marker, stage, ilp_path, channel, trained: true, active: true,
    notes: `Uploaded ${file.name} (${(buf.length / 1e6).toFixed(2)} MB)`,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, ilp_path, sizeMB: +(buf.length / 1e6).toFixed(2) });
}
