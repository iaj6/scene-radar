// Who is looking at the board, and what they're allowed to see.
//
// The board has two viewers:
//
//   owner   — you, past HTTP Basic Auth. Sees and edits everything.
//   public  — an anonymous visitor, only when PUBLIC_VIEW=1. Read-only, and never
//             sees the human-owned fields (your triage decisions and notes).
//
// Everything else on the board is the agent's research into public events, which is
// the interesting part and is safe to publish.

import type { Show, Status } from "./store";
import type { Band } from "./bands";

export type Viewer = "owner" | "public";

// proxy.ts sets this on every request from its own auth result, and overwrites any
// value the client sent. Never trust an inbound copy — that would let a visitor
// promote themselves to owner with one header.
export const VIEWER_HEADER = "x-scene-radar-viewer";

// Off unless explicitly enabled, so an unset env var can never open the board.
export function publicViewEnabled(): boolean {
  return process.env.PUBLIC_VIEW === "1";
}

// Fail closed: anything that isn't an explicit "owner" is treated as public, so a
// missing or mangled header over-redacts instead of leaking.
//
// This module stays free of `next/headers` so proxy.ts can import it — middleware runs
// on the edge runtime, where that import is unavailable. Server components go through
// getViewer() in viewer-server.ts instead.
export function viewerFrom(h: { get(name: string): string | null }): Viewer {
  return h.get(VIEWER_HEADER) === "owner" ? "owner" : "public";
}

// A Show as the UI receives it. Public viewers get one with `status` and `notes`
// absent — not blanked, absent, because server components serialize their props into
// the RSC payload. A field that is merely hidden in JSX is still in the page source.
export type ViewShow = Omit<Show, "status" | "notes"> & {
  status?: Status;
  notes?: string;
};

// `status` and `notes` are exactly EDITABLE in store.ts — the two fields a sweep may
// never touch because they're yours. They're also the only ones that say anything
// about where you'll physically be, so they're the two that come out.
export function redactShow(s: Show): ViewShow {
  const { status, notes, ...rest } = s;
  return rest;
}

// Bands keep `tier` and `lineup_qualifier`: those are taste, they're the substance of
// the roster, and they say nothing about your movements. Only free-text notes go.
export function redactBand(b: Band): Band {
  const { notes, ...rest } = b;
  return rest;
}

export function redactShows(shows: Show[], viewer: Viewer): ViewShow[] {
  return viewer === "owner" ? shows : shows.map(redactShow);
}

export function redactBands(bands: Band[], viewer: Viewer): Band[] {
  return viewer === "owner" ? bands : bands.map(redactBand);
}
