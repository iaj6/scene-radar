import { put, list, get } from "@vercel/blob";

// The sweep archive.
//
// Reports were landing in sweeps/*.md on whichever laptop ran the CLI — invisible from
// anywhere else, and impossible to look back through. The runner POSTs each finished
// sweep here so the history lives with everything else it produced.
//
// Read-only in the UI. A sweep is a record of what happened; it isn't editable.

const KEY = (id: string) => `sweeps/${id}.json`;

export interface Sweep {
  id: string; // the Managed Agents session id — the natural primary key
  ran_at: string; // ISO
  kind: "bootstrap" | "sweep" | "custom";
  verdict?: string; // grader: satisfied | max_iterations_reached | failed | interrupted
  verdict_notes?: string;
  report: string; // the full markdown report
  mission?: string; // what it was asked to do
  stats?: {
    bands_checked?: number;
    confirmed?: number;
    signals?: number;
    nodes?: number;
    pushed?: number;
  };
}

export async function listSweeps(): Promise<Sweep[]> {
  const { blobs } = await list({ prefix: "sweeps/" });
  const sweeps = await Promise.all(
    blobs.map(async (b) => {
      const r = await get(b.pathname, { access: "private" });
      return JSON.parse(await new Response(r!.stream).text()) as Sweep;
    }),
  );
  return sweeps.sort((a, b) => (b.ran_at ?? "").localeCompare(a.ran_at ?? ""));
}

export async function readSweep(id: string): Promise<Sweep | null> {
  try {
    const r = await get(KEY(id), { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as Sweep;
  } catch {
    return null;
  }
}

export async function saveSweep(s: Sweep): Promise<Sweep> {
  await put(KEY(s.id), JSON.stringify(s), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return s;
}

// A sweep's own tally line is the most reliable summary of it, but parsing prose is
// brittle — so this is best-effort and every field is optional. The UI shows a dash
// when a number didn't come through rather than inventing one.
export function parseStats(report: string): Sweep["stats"] {
  const stats: NonNullable<Sweep["stats"]> = {};
  const checked = report.match(/Checked (\d+) of \d+ watchlist bands/i);
  if (checked) stats.bands_checked = Number(checked[1]);
  const confirmed = report.match(/(\d+) CONFIRMED shows?/i);
  if (confirmed) stats.confirmed = Number(confirmed[1]);
  const frontier = report.match(/Frontier:\s*(\d+)/i);
  if (frontier) stats.nodes = Number(frontier[1]);
  const pushed = report.match(/(\d+) shows? pushed to the board/i);
  if (pushed) stats.pushed = Number(pushed[1]);
  return Object.keys(stats).length ? stats : undefined;
}
