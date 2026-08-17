import { NextRequest, NextResponse } from "next/server";

// Compare secrets by SHA-256 digest so the `===` timing reveals nothing about the
// expected value (edge runtime has no timingSafeEqual; hashing first is the standard
// workaround — equal-length digests, and a partial-match timing signal on a digest
// doesn't help an attacker reconstruct the secret).
async function secretMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(presented)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

async function bearerOk(auth: string, expected: string | undefined): Promise<boolean> {
  if (!expected || !auth.startsWith("Bearer ")) return false;
  return secretMatches(auth.slice(7), expected);
}

// Auth doors:
//  - /api/mcp|sse|message: the radar agent, presenting `Bearer ${MCP_TOKEN}` from its vault.
//  - /api/sweeps: the sweep runner archiving reports, listing them, and backfilling
//    grader verdicts, via `Bearer ${INGEST_TOKEN}`. GET is included deliberately —
//    reconciling needs to read what's already filed.
//  - everything else (the UI + all curation PATCHes): you, via HTTP Basic Auth (BOARD_PASSWORD).
// Every door fails closed when its env var is unset. Basic Auth is only open without a
// password on a local dev server — never on Vercel.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const auth = req.headers.get("authorization") ?? "";

  if (pathname === "/api/mcp" || pathname === "/api/sse" || pathname === "/api/message") {
    if (await bearerOk(auth, process.env.MCP_TOKEN)) return NextResponse.next();
    return new NextResponse("unauthorized", { status: 401 });
  }

  // The sweep runner posting a finished report. Its own bearer, so a leaked
  // ingest token can write history but cannot read or curate the board.
  if (pathname === "/api/sweeps") {
    if (await bearerOk(auth, process.env.INGEST_TOKEN)) return NextResponse.next();
    return new NextResponse("unauthorized", { status: 401 });
  }

  const pass = process.env.BOARD_PASSWORD;
  if (!pass) {
    // No password configured: open ONLY on a local dev server. On Vercel this locks the
    // board rather than silently publishing where you're going on Friday night.
    if (!process.env.VERCEL) return NextResponse.next();
    return new NextResponse("BOARD_PASSWORD is not configured — set it in the project's env vars", {
      status: 503,
    });
  }
  if (auth.startsWith("Basic ")) {
    let pw = "";
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(":");
      if (sep >= 0) pw = decoded.slice(sep + 1); // username ignored; password may contain ':'
    } catch {
      // malformed base64 → fall through to 401
    }
    if (pw && (await secretMatches(pw, pass))) return NextResponse.next();
  }
  return new NextResponse("auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Scene Radar"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
