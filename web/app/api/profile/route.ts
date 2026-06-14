import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const BUCKET = "avatars";

// POST /api/profile (multipart): userId, name, description, file?(image)
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const userId = String(form.get("userId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const file = form.get("file") as File | null;
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 400 });

  const row: any = { user_id: userId, name, description, updated_at: new Date().toISOString() };

  if (file && file.size) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${userId}/avatar.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(key, buf, {
      upsert: true, contentType: file.type || "image/png",
    });
    if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    row.avatar_url = `${base}/storage/v1/object/public/${BUCKET}/${key}?v=${Date.now()}`;
  }

  const { error } = await admin.from("profiles").upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, avatar_url: row.avatar_url ?? null });
}
