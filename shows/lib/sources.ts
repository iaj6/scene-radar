import { put, list, get, del } from "@vercel/blob";

// The source registry — where the radar looks.
//
// This was a markdown file baked into the system prompt, which meant confirming the
// bootstrap's venue proposals required editing a file and re-pushing an agent version.
// Now it's data: the radar proposes, you confirm in the UI, and the agent reads the
// adopted set over MCP on the next sweep with no redeploy.
//
// Coverage here matters more than any prompt cleverness — these shows are beneath the
// aggregators, so the registry IS the reach of the whole project.

const KEY = (id: string) => `sources/${id}.json`;

export type SourceKind = "lister" | "venue" | "promoter" | "label";
export const SOURCE_KINDS: SourceKind[] = ["lister", "venue", "promoter", "label"];

// proposed — the radar suggested it; you haven't ruled yet. Not used in sweeps.
// adopted  — in the rotation.
// rejected — ruled out. Kept so it isn't re-proposed (e.g. a venue that has closed).
export type SourceStatus = "proposed" | "adopted" | "rejected";
export const SOURCE_STATUSES: SourceStatus[] = ["proposed", "adopted", "rejected"];

// Whether the agent could actually load the page. The distinction between "checked,
// nothing there" and "couldn't see" is load-bearing everywhere in this project.
export type Reach = "fetched" | "login-walled" | "dead" | "unverified";
export const REACHES: Reach[] = ["fetched", "login-walled", "dead", "unverified"];

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string;
  region?: string; // "Boston MA", "Montréal QC", "RI"
  where_posted?: string; // "own calendar", "Instagram only", "WordPress post"

  // human-owned
  status: SourceStatus;
  tier?: 1 | 2 | null; // 1 = check every sweep, 2 = check when a band shows a live signal
  notes?: string;

  // agent-owned
  reach?: Reach;
  reach_notes?: string;
  produced_finds?: number; // how many confirmed shows this source has surfaced
  last_checked?: string;

  proposed_by: "radar" | "human";
  added_at: string;
  updated_at: string;
}

export const SOURCE_HUMAN_FIELDS = ["status", "tier", "notes", "name", "url", "region", "kind"] as const;
export const SOURCE_AGENT_FIELDS = ["reach", "reach_notes", "produced_finds", "last_checked", "where_posted"] as const;

export function sourceId(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "source"
  );
}

async function readOne(id: string): Promise<Source | null> {
  try {
    const r = await get(KEY(id), { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as Source;
  } catch {
    return null;
  }
}

async function write(s: Source): Promise<void> {
  await put(KEY(s.id), JSON.stringify(s), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// Adopted first (tier 1 before tier 2), then proposed, then rejected.
const RANK: Record<SourceStatus, number> = { adopted: 0, proposed: 1, rejected: 2 };
export async function listSources(): Promise<Source[]> {
  const { blobs } = await list({ prefix: "sources/" });
  const sources = await Promise.all(
    blobs.map(async (b) => {
      const r = await get(b.pathname, { access: "private" });
      return JSON.parse(await new Response(r!.stream).text()) as Source;
    }),
  );
  return sources.sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
    const at = a.tier ?? 9;
    const bt = b.tier ?? 9;
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });
}

export async function readSource(id: string): Promise<Source | null> {
  return readOne(id);
}

export async function upsertSourceHuman(input: Partial<Source> & { name: string }): Promise<Source> {
  const id = input.id || sourceId(input.name);
  const existing = await readOne(id);
  const now = new Date().toISOString();
  const merged: Source = {
    ...existing,
    ...input,
    id,
    name: input.name,
    kind: input.kind ?? existing?.kind ?? "venue",
    status: input.status ?? existing?.status ?? "adopted",
    proposed_by: existing?.proposed_by ?? "human",
    added_at: existing?.added_at ?? now,
    updated_at: now,
  };
  await write(merged);
  return merged;
}

export async function patchSourceHuman(id: string, fields: Partial<Source>): Promise<Source | null> {
  const existing = await readOne(id);
  if (!existing) return null;
  const patch: Partial<Source> = {};
  for (const k of SOURCE_HUMAN_FIELDS) if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
  if (patch.status && !SOURCE_STATUSES.includes(patch.status)) throw new Error("bad status");
  // Adopting a source without a tier defaults it to the "check on a live signal" tier.
  if (patch.status === "adopted" && existing.tier == null && patch.tier === undefined) patch.tier = 2;
  const updated: Source = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await write(updated);
  return updated;
}

export async function patchSourceAgent(id: string, fields: Partial<Source>): Promise<Source | null> {
  const existing = await readOne(id);
  if (!existing) return null;
  const patch: Partial<Source> = {};
  for (const k of SOURCE_AGENT_FIELDS) if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
  if (patch.reach && !REACHES.includes(patch.reach)) throw new Error("bad reach");
  const updated: Source = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await write(updated);
  return updated;
}

// The radar proposing a source. Same rule as bands: never overwrite an existing entry,
// and never resurrect a rejected one (that's how a venue you rejected for being long
// closed stays dead instead of being re-proposed every bootstrap).
export async function proposeSource(
  input: Partial<Source> & { name: string; kind: SourceKind },
): Promise<{ source: Source; created: boolean; reason?: string }> {
  const id = sourceId(input.name);
  const existing = await readOne(id);
  if (existing) {
    return {
      source: existing,
      created: false,
      reason:
        existing.status === "rejected"
          ? "already rejected — not re-proposed"
          : `already in the registry (${existing.status})`,
    };
  }
  const now = new Date().toISOString();
  const source: Source = {
    ...input,
    id,
    status: "proposed",
    tier: null,
    proposed_by: "radar",
    added_at: now,
    updated_at: now,
  };
  await write(source);
  return { source, created: true };
}

export async function deleteSource(id: string): Promise<void> {
  await del(KEY(id));
}
