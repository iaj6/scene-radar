import { NextRequest, NextResponse } from "next/server";
import { patchSourceHuman, deleteSource } from "@/lib/sources";
import { refuseIfPublic } from "@/lib/viewer-server";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const refused = await refuseIfPublic();
  if (refused) return refused;

  const { id } = await ctx.params;
  try {
    const updated = await patchSourceHuman(id, await req.json());
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const refused = await refuseIfPublic();
  if (refused) return refused;

  const { id } = await ctx.params;
  await deleteSource(id);
  return NextResponse.json({ ok: true });
}
