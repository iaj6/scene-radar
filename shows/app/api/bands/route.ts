import { NextRequest, NextResponse } from "next/server";
import { upsertBandHuman } from "@/lib/bands";
import { refuseIfPublic } from "@/lib/viewer-server";

// Add a band by hand from the roster UI.
export async function POST(req: NextRequest) {
  const refused = await refuseIfPublic();
  if (refused) return refused;

  try {
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    return NextResponse.json(await upsertBandHuman({ ...body, name: body.name.trim() }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
