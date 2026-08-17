import { NextRequest, NextResponse } from "next/server";
import { patchShow, deleteShow } from "@/lib/store";

// Human edits from the board UI. Only the EDITABLE fields (status, notes) get through —
// patchShow filters and validates. Auth is handled upstream in proxy.ts (Basic Auth).

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const updated = await patchShow(id, body);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteShow(id);
  return NextResponse.json({ ok: true });
}
