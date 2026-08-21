import { put, list, get, del } from "@vercel/blob";

// One private JSON blob per show. Independent writes → no read-modify-write races
// when a sweep pushes several shows at once. Token comes from BLOB_READ_WRITE_TOKEN.
const KEY = (id: string) => `shows/${id}.json`;

// CONFIRMED requires a primary source URL the agent actually fetched, stating the date.
// Everything else is SIGNAL. This mirrors the `show-verification` skill exactly — if the
// two ever drift, the skill is the source of truth and this is the bug.
export type Confidence = "CONFIRMED" | "SIGNAL";

// Human triage. `going` = decided to go, `tickets` = actually holding them. The gap
// between those two is where a sold-out show hurts, so they're separate states.
export type Status = "new" | "interested" | "going" | "tickets" | "passed" | "missed";
export const STATUSES: Status[] = ["new", "interested", "going", "tickets", "passed", "missed"];

export interface Show {
  id: string;
  band: string;
  date: string | null; // yyyy-mm-dd; null when only a month/rumor is known (always SIGNAL)
  venue: string;
  city: string;
  confidence: Confidence;
  tier?: 1 | 2 | 3 | null; // from the taste profile; null = band not on the watchlist
  // null when there's no venue/city yet to judge — common for an undated SIGNAL.
  in_range?: boolean | null;
  // Some bands only count with specific members (see the taste profile's lineup
  // qualifiers). true = qualifier met or none exists, false = plainly fails,
  // null/undefined = lineup unstated. Anything but `true` suppresses break-glass.
  lineup_ok?: boolean | null;
  why_now?: string;
  tickets_url?: string | null;
  on_sale?: string | null; // yyyy-mm-dd — often the real deadline, not the show date
  sources?: string[];
  // human-owned
  status: Status;
  notes?: string;
  // provenance
  found_at?: string;
  updated_at?: string;
  found_by?: "radar" | "manual";
}

// Human-owned fields. A sweep re-pushing the same show refreshes the researched fields
// but must never reset triage state — the whole point of the board is that your decision
// survives the next sweep.
export const EDITABLE = ["status", "notes"] as const;

export function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "show"
  );
}

// Dedup key: band + venue + year-month. Chosen so a SIGNAL that firms up into a
// CONFIRMED date within the same month updates in place rather than duplicating —
// the common case. It does NOT handle a date sliding across a month boundary, or the
// same band playing the same venue twice in one month; for those the agent passes
// `replaces` on the new record to retire the stale one.
export function showId(band: string, venue: string, date: string | null): string {
  return slugify(`${band} ${venue} ${date ? date.slice(0, 7) : "tbd"}`);
}

async function readOne(id: string): Promise<Show | null> {
  try {
    const r = await get(KEY(id), { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as Show;
  } catch {
    return null; // BlobNotFoundError → treat as absent
  }
}

async function write(s: Show): Promise<void> {
  await put(KEY(s.id), JSON.stringify(s), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// Sorted soonest-first, with undated SIGNAL entries last — you can't plan around them.
export async function listShows(): Promise<Show[]> {
  const { blobs } = await list({ prefix: "shows/" });
  const shows = await Promise.all(
    blobs.map(async (b) => {
      const r = await get(b.pathname, { access: "private" });
      return JSON.parse(await new Response(r!.stream).text()) as Show;
    }),
  );
  return shows.sort((a, b) => {
    if (!a.date && !b.date) return a.band.localeCompare(b.band);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
}

// Structural params, not `Show`: these read only researched fields, never `status`.
// That's what lets them run unchanged over a redacted ViewShow (see lib/viewer.ts) —
// and it's enforced by the type rather than left to a comment.
export function isUpcoming(
  s: Pick<Show, "date">,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return s.date === null || s.date >= today;
}

// Break-glass: the things that stop being actionable if you see them a week late.
// Tier 1 anywhere, or tickets going on sale within `days`. A show whose on-sale date
// has already passed is not urgent — it's either gone or it isn't.
export function isUrgent(
  s: Pick<Show, "date" | "confidence" | "lineup_ok" | "tier" | "on_sale">,
  today = new Date().toISOString().slice(0, 10),
  days = 7,
): boolean {
  if (!isUpcoming(s, today) || s.confidence !== "CONFIRMED") return false;
  // A reunion that fails its lineup qualifier — or whose lineup nobody has stated — is
  // not the band he wants to see. Never alarm on one.
  if (s.lineup_ok === false || s.lineup_ok === null) return false;
  if (s.tier === 1) return true;
  if (!s.on_sale) return false;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);
  return s.on_sale >= today && s.on_sale <= horizon.toISOString().slice(0, 10);
}

// Upsert by derived id. A re-push refreshes researched fields but never clobbers
// EDITABLE ones. `replaces` retires a record this one supersedes (a firmed-up date
// that moved months, a venue correction).
export async function upsertShow(
  input: Partial<Show> & { band: string; venue: string; date: string | null },
  replaces?: string,
): Promise<Show> {
  const id = showId(input.band, input.venue, input.date);
  const existing = await readOne(id);
  const now = new Date().toISOString();

  const sourced: Partial<Show> = { ...input };
  if (existing) for (const k of EDITABLE) delete (sourced as Record<string, unknown>)[k];

  const merged: Show = {
    ...existing,
    ...sourced,
    id,
    band: input.band,
    venue: input.venue,
    date: input.date,
    city: input.city ?? existing?.city ?? "",
    confidence: input.confidence ?? existing?.confidence ?? "SIGNAL",
    status: existing?.status ?? "new", // never let a re-push reset your triage
    found_at: existing?.found_at ?? now,
    updated_at: now,
  };
  await write(merged);

  // Retire the superseded record only after the replacement is durable.
  if (replaces && replaces !== id) {
    const old = await readOne(replaces);
    // Carry the human's triage across — they decided about this show, not this blob.
    if (old && old.status !== "new") {
      await write({ ...merged, status: old.status, notes: old.notes ?? merged.notes });
    }
    await del(KEY(replaces)).catch(() => {});
  }
  return merged;
}

export async function patchShow(id: string, fields: Partial<Show>): Promise<Show | null> {
  const existing = await readOne(id);
  if (!existing) return null;
  const patch: Partial<Show> = {};
  for (const k of EDITABLE) if (k in fields) (patch as Record<string, unknown>)[k] = fields[k];
  if (patch.status && !STATUSES.includes(patch.status)) throw new Error("bad status");
  const updated: Show = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await write(updated);
  return updated;
}

export async function deleteShow(id: string): Promise<void> {
  await del(KEY(id));
}

export async function readShow(id: string): Promise<Show | null> {
  return readOne(id);
}
