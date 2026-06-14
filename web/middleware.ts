import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Force the canonical domain: any request hitting the *.vercel.app URL is
// permanently redirected to pullback-pipeline.com (same path preserved).
const CANONICAL = "pullback-pipeline.com";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (host.endsWith(".vercel.app")) {
    const url = req.nextUrl.clone();
    url.host = CANONICAL;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  // run on everything except Next internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
