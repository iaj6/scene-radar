import { put, list, get, del } from "@vercel/blob";

// THE ROSTER OF RECORD.
//
// This used to live in the agent's memory store as `_watchlist.md`, which the agent
// could write but a human could not meaningfully curate. It lives here now: the human
// owns who is on the list and how much they matter, the agent owns what it has learned
// about each one. The agent reads this over MCP at the start of every sweep.
//
// Memory keeps what memory is good at — per-band signal history, sourcing lessons,
// the narrative of past sweeps. It is no longer the source of truth for the roster.

const KEY = (slug: string) => `bands/${slug}.json`;

export type Tier = 1 | 2 | 3;

// How a band sits on the list. Only a human moves a band between these.
//   suggested — auto-added by the radar from a scene edge, awaiting your triage.
//               NOT swept: it costs nothing until you decide it's worth watching.
//   active    — swept on its recheck cadence.
//   paused    — kept on the list for reference, deliberately not swept.
//   dismissed — rejected. Never swept, never re-suggested, kept so the radar
//               cannot rediscover it every week.
export type Listed = "suggested" | "active" | "paused" | "dismissed";
export const LISTED: Listed[] = ["suggested", "active", "paused", "dismissed"];

// What the agent found out. `stirring` — signs of life without dates — is the
// highest-value state in the whole project and gets the tightest cadence.
export type BandStatus = "unknown" | "dormant" | "stirring" | "active" | "touring" | "defunct";
export const BAND_STATUSES: BandStatus[] = [
  "unknown", "dormant", "stirring", "active", "touring", "defunct",
];

export type Recheck = "weekly" | "monthly" | "quarterly";
export const RECHECKS: Recheck[] = ["weekly", "monthly", "quarterly"];

export interface DiscoveredVia {
  band: string; // the watchlist band this one connects to
  edge: string; // shared member | split release | same label | tourmates | same comp | same scene
  edge_detail: string;
}

export interface Band {
  slug: string;
  name: string;

  // ---- human-owned ----
  tier: Tier | null; // null while `suggested` — you assign a tier to promote it
  listed: Listed;
  notes?: string;
  lineup_qualifier?: string; // e.g. "original singer on vocals" — see the taste profile

  // ---- agent-owned ----
  canonical_url?: string; // Discogs/Bandcamp. Identity, settled once and reused.
  identity?: "confirmed" | "ambiguous";
  identity_notes?: string;
  region?: string;
  band_status?: BandStatus;
  signal?: string; // the one-line "what's true right now"
  sources?: string[];
  last_checked?: string; // yyyy-mm-dd
  recheck?: Recheck;
  // Some bands have no socials/Bandcamp/site at all — they ended before social media.
  // For them the highest-value signal ("dormant account posts") can never fire, so a
  // weekly check is wasted budget. The agent sets this; the UI surfaces it.
  no_surface?: boolean;
  discovered_via?: DiscoveredVia;

  // ---- provenance ----
  added_by: "human" | "radar";
  added_at: string;
  updated_at: string;
}

// Human-owned fields. An agent write can never touch these — that's what makes the
// roster curatable: your triage survives every sweep.
export const HUMAN_FIELDS = ["tier", "listed", "notes", "lineup_qualifier"] as const;

// Agent-owned fields, writable via bands_update.
export const AGENT_FIELDS = [
  "canonical_url", "identity", "identity_notes", "region", "band_status",
  "signal", "sources", "last_checked", "recheck", "no_surface",
] as const;

export function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "band"
  );
}

const DAYS: Record<Recheck, number> = { weekly: 7, monthly: 30, quarterly: 91 };

// Is this band due for a check today? Only `active` bands are ever due — suggested,
// paused and dismissed bands cost no sweep budget by design.
export function isDue(b: Band, today = new Date().toISOString().slice(0, 10)): boolean {
  if (b.listed !== "active") return false;
  if (!b.last_checked) return true; // never checked
  const due = new Date(b.last_checked);
  due.setDate(due.getDate() + DAYS[b.recheck ?? "weekly"]);
  return due.toISOString().slice(0, 10) <= today;
}

export function daysSinceChecked(b: Band, today = new Date().toISOString().slice(0, 10)): number | null {
  if (!b.last_checked) return null;
  return Math.round(
    (new Date(today).getTime() - new Date(b.last_checked).getTime()) / 86_400_000,
  );
}

async function readOne(slug: string): Promise<Band | null> {
  try {
    const r = await get(KEY(slug), { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as Band;
  } catch {
    return null;
  }
}

async function write(b: Band): Promise<void> {
  await put(KEY(b.slug), JSON.stringify(b), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// Tier first, then name. Suggested bands (tier null) sort last — they're a queue,
// not part of the working roster yet.
export async function listBands(): Promise<Band[]> {
  const { blobs } = await list({ prefix: "bands/" });
  const bands = await Promise.all(
    blobs.map(async (b) => {
      const r = await get(b.pathname, { access: "private" });
      return JSON.parse(await new Response(r!.stream).text()) as Band;
    }),
  );
  return bands.sort((a, b) => {
    const at = a.tier ?? 99;
    const bt = b.tier ?? 99;
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });
}

export async function readBand(slug: string): Promise<Band | null> {
  return readOne(slug);
}

// Human create/edit from the UI. Creating by hand lands `active` with a tier.
export async function upsertBandHuman(
  input: Partial<Band> & { name: string },
): Promise<Band> {
  const slug = slugify(input.slug || input.name);
  const existing = await readOne(slug);
  const now = new Date().toISOString();
  const merged: Band = {
    ...existing,
    ...input,
    slug,
    name: input.name,
    tier: input.tier ?? existing?.tier ?? null,
    listed: input.listed ?? existing?.listed ?? "active",
    added_by: existing?.added_by ?? "human",
    added_at: existing?.added_at ?? now,
    updated_at: now,
  };
  await write(merged);
  return merged;
}

// Human triage — the only path that may change tier/listed/notes/qualifier.
export async function patchBandHuman(slug: string, fields: Partial<Band>): Promise<Band | null> {
  const existing = await readOne(slug);
  if (!existing) return null;
  const patch: Partial<Band> = {};
  for (const k of HUMAN_FIELDS) if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
  if (patch.listed && !LISTED.includes(patch.listed)) throw new Error("bad listed state");
  if (patch.tier != null && ![1, 2, 3].includes(patch.tier)) throw new Error("bad tier");

  // Giving a suggested band a tier is what promotes it onto the working roster.
  if (existing.listed === "suggested" && patch.tier != null && patch.listed === undefined) {
    patch.listed = "active";
  }
  const updated: Band = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await write(updated);
  return updated;
}

// Agent research write. Physically cannot change tier/listed/notes/qualifier — the
// guarantee is structural, not a promise in a prompt.
export async function patchBandAgent(slug: string, fields: Partial<Band>): Promise<Band | null> {
  const existing = await readOne(slug);
  if (!existing) return null;
  const patch: Partial<Band> = {};
  for (const k of AGENT_FIELDS) if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
  if (patch.band_status && !BAND_STATUSES.includes(patch.band_status)) throw new Error("bad status");
  if (patch.recheck && !RECHECKS.includes(patch.recheck)) throw new Error("bad recheck");
  const updated: Band = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await write(updated);
  return updated;
}

// The radar proposing a band it found via a scene edge.
// Two rules that matter:
//   1. A band already on the roster is NEVER modified here — re-suggesting an active
//      band must not reset it, and re-suggesting a DISMISSED band must not resurrect
//      it. That's what stops the radar rediscovering the same dead end every week.
//   2. New suggestions land tier-less and unswept. They cost nothing until you triage.
export async function suggestBand(
  name: string,
  via: DiscoveredVia,
  extra: Partial<Band> = {},
): Promise<{ band: Band; created: boolean; reason?: string }> {
  const slug = slugify(name);
  const existing = await readOne(slug);
  if (existing) {
    return {
      band: existing,
      created: false,
      reason:
        existing.listed === "dismissed"
          ? "already dismissed — not re-added"
          : `already on the roster (${existing.listed})`,
    };
  }
  const now = new Date().toISOString();
  const band: Band = {
    ...extra,
    slug,
    name,
    tier: null,
    listed: "suggested",
    discovered_via: via,
    added_by: "radar",
    added_at: now,
    updated_at: now,
  };
  await write(band);
  return { band, created: true };
}

export async function deleteBand(slug: string): Promise<void> {
  await del(KEY(slug));
}
