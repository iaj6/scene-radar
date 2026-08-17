import { NextRequest, NextResponse } from "next/server";
import { saveSweep, listSweeps, readSweep, parseStats, type Sweep } from "@/lib/sweeps";

// The sweep runner POSTs finished reports here (bearer-authed in proxy.ts) so the
// history lives with everything else the sweep produced, instead of only in a
// markdown file on whichever laptop happened to run the CLI.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Sweep>;
    if (!body.id || !body.report) {
      return NextResponse.json({ error: "id and report are required" }, { status: 400 });
    }
    const sweep: Sweep = {
      id: body.id,
      ran_at: body.ran_at ?? new Date().toISOString(),
      kind: body.kind ?? "sweep",
      verdict: body.verdict,
      verdict_notes: body.verdict_notes,
      mission: body.mission,
      report: body.report,
      stats: body.stats ?? parseStats(body.report),
    };
    await saveSweep(sweep);
    return NextResponse.json({ ok: true, id: sweep.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// Verdict-only patch. The grader runs after the agent stops, so a self-archived sweep
// has no verdict until this backfills it. Deliberately NOT a re-POST: the list endpoint
// strips `report`, so a caller round-tripping through it would blank the agent's report.
// This touches the two verdict fields and nothing else.
export async function PATCH(req: NextRequest) {
  try {
    const { id, verdict, verdict_notes } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = await readSweep(id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await saveSweep({ ...existing, verdict, verdict_notes });
    return NextResponse.json({ ok: true, id, verdict });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET() {
  const sweeps = await listSweeps();
  return NextResponse.json(sweeps.map(({ report, ...rest }) => rest));
}
