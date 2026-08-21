import { NextRequest, NextResponse } from "next/server";
import { patchBandHuman, deleteBand } from "@/lib/bands";
import { refuseIfPublic } from "@/lib/viewer-server";

// Human curation from the roster UI. patchBandHuman filters to HUMAN_FIELDS, so this
// route can only touch tier/listed/notes/lineup_qualifier — never the agent's research.
// Auth is handled upstream in proxy.ts (Basic Auth).

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const refused = await refuseIfPublic();
  if (refused) return refused;

  const { slug } = await ctx.params;
  try {
    const updated = await patchBandHuman(slug, await req.json());
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const refused = await refuseIfPublic();
  if (refused) return refused;

  const { slug } = await ctx.params;
  await deleteBand(slug);
  return NextResponse.json({ ok: true });
}
