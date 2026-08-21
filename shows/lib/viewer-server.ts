// Server-component half of lib/viewer.ts, split out because `next/headers` cannot be
// imported from the edge runtime that proxy.ts runs in.

import { headers } from "next/headers";
import { viewerFrom, type Viewer } from "./viewer";

export async function getViewer(): Promise<Viewer> {
  return viewerFrom(await headers());
}

// Defense in depth for mutating route handlers. proxy.ts already refuses non-safe
// methods from a public viewer, so this should be unreachable — which is exactly why
// it's here: a future matcher change or a mis-set env var shouldn't turn into a
// writable public board. Returns a 403 to refuse, or null to proceed.
export async function refuseIfPublic(): Promise<Response | null> {
  if ((await getViewer()) === "owner") return null;
  return new Response("read-only: this board is published in view-only mode", {
    status: 403,
  });
}
