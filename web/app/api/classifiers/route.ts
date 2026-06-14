import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Service-role client: uploads to Storage + writes the classifiers row (bypasses RLS).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const BUCKET = "classifiers";

// POST /api/classifiers  (multipart: file=.ilp, marker, channel)
// Uploads the trained .ilp to Storage and registers it as the marker's active classifier.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const marker = String(form.get("marker") ?? "").trim();
  const channel = Number(form.get("channel") ?? 0);

  if (!file || !marker) {
    return NextResponse.json({ error: "file and marker are required" }, { status: 400 });
  }
  if (!/\.ilp\d*$/i.test(file.name)) {
    return NextResponse.json({ error: "expected a .ilp file" }, { status: 400 });
  }

  const key = `${marker}/${file.name}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(key, buf, {
    upsert: true, contentType: "application/octet-stream",
  });
  if (upErr) {
    return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
  }

  // make this the active classifier for the marker (deactivate any prior active one)
  await admin.from("classifiers").update({ active: false }).eq("marker", marker).eq("active", true);
  const ilp_path = `storage://${BUCKET}/${key}`;
  const { error: insErr } = await admin.from("classifiers").insert({
    marker, ilp_path, channel, trained: true, active: true,
    notes: `Uploaded ${file.name} (${(buf.length / 1e6).toFixed(2)} MB)`,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ilp_path, sizeMB: +(buf.length / 1e6).toFixed(2) });
}
