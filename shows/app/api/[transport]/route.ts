import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  listShows, upsertShow, patchShow, readShow, isUpcoming, isUrgent, STATUSES, type Show,
} from "@/lib/store";
import {
  listBands, readBand, patchBandAgent, suggestBand, isDue,
  BAND_STATUSES, RECHECKS, type Band,
} from "@/lib/bands";
import {
  listSources, patchSourceAgent, proposeSource, SOURCE_KINDS, REACHES, type Source,
} from "@/lib/sources";
import { saveSweep, readSweep, parseStats } from "@/lib/sweeps";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (message: string) => ({
  content: [{ type: "text" as const, text: `Error: ${message}` }],
  isError: true,
});

const showRow = (s: Show) => ({
  id: s.id, band: s.band, date: s.date, venue: s.venue, city: s.city,
  confidence: s.confidence, tier: s.tier, status: s.status, on_sale: s.on_sale,
  urgent: isUrgent(s),
});

const bandRow = (b: Band) => ({
  slug: b.slug, name: b.name, tier: b.tier, listed: b.listed,
  band_status: b.band_status ?? "unknown", identity: b.identity,
  canonical_url: b.canonical_url, region: b.region,
  last_checked: b.last_checked, recheck: b.recheck, due: isDue(b),
  no_surface: b.no_surface, lineup_qualifier: b.lineup_qualifier,
  signal: b.signal,
});

const sourceRow = (s: Source) => ({
  id: s.id, name: s.name, kind: s.kind, url: s.url, region: s.region,
  status: s.status, tier: s.tier, reach: s.reach, where_posted: s.where_posted,
  produced_finds: s.produced_finds ?? 0, notes: s.notes,
});

const handler = createMcpHandler(
  (server) => {
    // ---------------------------------------------------------------- roster ----
    // The roster is human-curated and lives here, not in your memory store. Read it
    // at the start of every sweep; it is the authoritative answer to "who am I
    // watching and how much do they matter".

    server.tool(
      "bands_list",
      "THE ROSTER — read this FIRST on every sweep, before touching memory. It is the authoritative watchlist: who is on it, their tier, and whether they are due for a check. The human curates this; tiers and list membership can change between sweeps and those changes are binding. Defaults to the bands you should actually work (listed=active).",
      {
        listed: z
          .enum(["active", "suggested", "paused", "dismissed", "all"])
          .default("active")
          .describe("Default 'active' — the working roster. 'suggested' shows your own unvetted discoveries. 'dismissed' is what the human rejected: never research or re-suggest these."),
        due_only: z
          .boolean()
          .default(false)
          .describe("true returns only bands due for a check today per their recheck cadence — use this to build the sweep's work queue."),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      },
      async ({ listed, due_only, tier }) => {
        try {
          let bands = await listBands();
          if (listed !== "all") bands = bands.filter((b) => b.listed === listed);
          if (due_only) bands = bands.filter((b) => isDue(b));
          if (tier) bands = bands.filter((b) => b.tier === tier);
          return json({ count: bands.length, bands: bands.map(bandRow) });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "bands_get",
      "Full record for one band: canonical_url and identity, everything you learned last sweep, plus any notes or lineup qualifier the human attached. Start here rather than re-deriving a band from a name search.",
      { slug: z.string() },
      async ({ slug }) => {
        try {
          const b = await readBand(slug);
          if (!b) return err(`no band with slug "${slug}"`);
          return json(b);
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "bands_update",
      "Record what you learned about a band: identity, status, signal, sources, cadence. Call this for EVERY band you check, including ones where you found nothing — last_checked is how the roster knows the work happened. You cannot change tier or list membership here; those are the human's.",
      {
        slug: z.string(),
        canonical_url: z.string().optional().describe("Discogs/Bandcamp artist page — the identity that gets reused every future sweep. Set it as soon as you establish it."),
        identity: z.enum(["confirmed", "ambiguous"]).optional()
          .describe("'ambiguous' means you could not separate this band from a same-named act. Attach no shows when ambiguous."),
        identity_notes: z.string().optional().describe("How you settled it, or the candidates you couldn't separate. Include known false positives so the next sweep doesn't repeat the work."),
        region: z.string().optional(),
        band_status: z.enum(BAND_STATUSES as [string, ...string[]]).optional()
          .describe("'stirring' = signs of life without dates. That is the highest-value state; say so when you see it."),
        signal: z.string().optional().describe("One line: what is true about this band right now."),
        sources: z.array(z.string()).optional(),
        last_checked: z.string().optional().describe("yyyy-mm-dd — set this whenever you check the band."),
        recheck: z.enum(RECHECKS as [string, ...string[]]).optional()
          .describe("Push long-dormant bands out to monthly/quarterly so budget goes where movement is."),
        no_surface: z.boolean().optional()
          .describe("true when the band has NO socials, Bandcamp or website at all — they predate social media. The 'dormant account wakes up' signal can never fire for them, so weekly checks are wasted."),
      },
      async ({ slug, ...fields }) => {
        try {
          const updated = await patchBandAgent(slug, fields as Partial<Band>);
          if (!updated) return err(`no band with slug "${slug}"`);
          return json({ ok: true, slug: updated.slug, last_checked: updated.last_checked });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "bands_suggest",
      "Add a band you discovered through a scene edge to the roster as a SUGGESTION for the human to triage. It lands with no tier and is not swept until they promote it, so suggesting costs nothing. Requires a hard edge — shared member, split, label, tourmates, comp, scene. Sonic similarity is NOT an edge and must never be used here. Re-suggesting a band already on the roster is a safe no-op, and a dismissed band is never resurrected.",
      {
        name: z.string(),
        connects_to: z.string().describe("The roster band this one links to"),
        edge: z.enum(["shared member", "split release", "same label", "tourmates", "same comp", "same scene"]),
        edge_detail: z.string().describe("The specific connection — name the person, the split, the comp with its catalogue number"),
        canonical_url: z.string().optional(),
        region: z.string().optional(),
        band_status: z.enum(BAND_STATUSES as [string, ...string[]]).optional(),
        signal: z.string().optional().describe("Why they're worth a look — especially whether they're currently active"),
        sources: z.array(z.string()).optional(),
      },
      async ({ name, connects_to, edge, edge_detail, ...extra }) => {
        try {
          const r = await suggestBand(name, { band: connects_to, edge, edge_detail }, extra as Partial<Band>);
          return json({ ok: true, slug: r.band.slug, created: r.created, reason: r.reason });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    // ---------------------------------------------------------------- shows -----
    server.tool(
      "shows_list",
      "List shows on the board, soonest first. Defaults to upcoming only. Call this BEFORE adding anything, so you can dedup against what's already there and find the id of a record you may need to supersede. A show whose status is anything but 'new' has already been triaged by the human — do not re-report it as a find.",
      {
        when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
        band: z.string().optional().describe("Filter to one band (case-insensitive substring)"),
        confidence: z.enum(["CONFIRMED", "SIGNAL"]).optional(),
        status: z.enum(STATUSES as [string, ...string[]]).optional(),
      },
      async ({ when, band, confidence, status }) => {
        try {
          let shows = await listShows();
          if (when === "upcoming") shows = shows.filter((s) => isUpcoming(s));
          else if (when === "past") shows = shows.filter((s) => !isUpcoming(s));
          if (band) {
            const q = band.toLowerCase();
            shows = shows.filter((s) => s.band.toLowerCase().includes(q));
          }
          if (confidence) shows = shows.filter((s) => s.confidence === confidence);
          if (status) shows = shows.filter((s) => s.status === status);
          return json({ count: shows.length, shows: shows.map(showRow) });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "shows_get",
      "Get the full record for one show by id, including sources, why_now, and any notes the human added.",
      { id: z.string() },
      async ({ id }) => {
        try {
          const s = await readShow(id);
          if (!s) return err(`no show with id "${id}"`);
          return json(s);
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "shows_add",
      "Add or update a show on the board. Only push shows that pass the taste profile's ring rules for their tier. A CONFIRMED entry REQUIRES a source URL you actually fetched that states the date — if you don't have one, push it as SIGNAL with date=null rather than guessing. Re-pushing an existing show refreshes the researched fields and never resets the human's triage status.",
      {
        band: z.string(),
        venue: z.string().describe("Use 'TBD' only for a SIGNAL with no venue yet."),
        city: z.string().describe("City, ST — e.g. 'Boston, MA'"),
        date: z.string().nullable().describe("yyyy-mm-dd. null when only a month or a rumor is known — which also means confidence must be SIGNAL."),
        confidence: z.enum(["CONFIRMED", "SIGNAL"]),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
        in_range: z.boolean().nullable().optional()
          .describe("Does this satisfy the ring rules for its tier? null when the show has no venue/city yet to judge — common for an undated SIGNAL."),
        lineup_ok: z.boolean().nullable().optional()
          .describe("For bands with a lineup qualifier: true if met or none exists, false if it plainly fails, null if the announcement doesn't state the lineup. Anything but true suppresses the urgent alert."),
        why_now: z.string().optional(),
        tickets_url: z.string().nullable().optional(),
        on_sale: z.string().nullable().optional().describe("yyyy-mm-dd — often the real deadline"),
        sources: z.array(z.string()),
        replaces: z.string().optional().describe("id of a record this supersedes. The old row is deleted and its triage status carried over."),
      },
      async ({ replaces, ...input }) => {
        try {
          if (input.confidence === "CONFIRMED") {
            if (!input.date) return err("a CONFIRMED show must have a date — push it as SIGNAL instead");
            if (!input.sources?.length) return err("a CONFIRMED show must cite at least one source URL you fetched");
          }
          if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
            return err(`date must be yyyy-mm-dd, got "${input.date}"`);
          }
          const s = await upsertShow({ ...input, found_by: "radar" }, replaces);
          return json({ ok: true, id: s.id, band: s.band, date: s.date, status: s.status });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    // Triage is the human's. The only status an agent has any business writing is
    // 'missed', during calendar cleanup — so that's the only one this door accepts.
    server.tool(
      "shows_update",
      "Mark a past show as missed during calendar cleanup, and/or append a note. Every other status is the human's decision and cannot be set here.",
      {
        id: z.string(),
        status: z.literal("missed").optional(),
        notes: z.string().optional(),
      },
      async ({ id, ...fields }) => {
        try {
          const updated = await patchShow(id, fields as Partial<Show>);
          if (!updated) return err(`no show with id "${id}"`);
          return json({ ok: true, id: updated.id, status: updated.status });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    // -------------------------------------------------------------- sources ----
    server.tool(
      "sources_list",
      "The source registry — where to look. Defaults to adopted sources, which are the ones the human confirmed and you should actually check. Tier 1 sources get checked every sweep; tier 2 when a band shows a live signal. Rejected sources are ruled out permanently (e.g. a venue that has closed) — never propose one again.",
      {
        status: z.enum(["adopted", "proposed", "rejected", "all"]).default("adopted"),
        kind: z.enum(SOURCE_KINDS as [string, ...string[]]).optional(),
        tier: z.union([z.literal(1), z.literal(2)]).optional(),
      },
      async ({ status, kind, tier }) => {
        try {
          let sources = await listSources();
          if (status !== "all") sources = sources.filter((s) => s.status === status);
          if (kind) sources = sources.filter((s) => s.kind === kind);
          if (tier) sources = sources.filter((s) => s.tier === tier);
          return json({ count: sources.length, sources: sources.map(sourceRow) });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "sources_propose",
      "Propose a source for the human to confirm. It lands as 'proposed' and is NOT used in sweeps until they adopt it — a hallucinated venue is a hallucinated show, so nothing you propose becomes a source on your say-so. Be honest in `reach` about whether you actually loaded the page. Re-proposing an existing or rejected source is a safe no-op.",
      {
        name: z.string(),
        kind: z.enum(SOURCE_KINDS as [string, ...string[]]),
        url: z.string().optional(),
        region: z.string().optional().describe("e.g. 'Boston MA', 'Providence RI', 'Montréal QC'"),
        where_posted: z.string().optional().describe("Where dates actually appear — 'own calendar', 'Instagram only', 'one long WordPress post'"),
        reach: z.enum(REACHES as [string, ...string[]]).optional()
          .describe("'fetched' ONLY if you actually loaded it. 'login-walled' and 'dead' are useful findings; 'unverified' means you found it referenced but did not open it."),
        reach_notes: z.string().optional(),
        notes: z.string().optional().describe("Why it's worth adopting — capacity, what class of show it carries, whether it produced a find"),
      },
      async (input) => {
        try {
          const r = await proposeSource(input as Partial<Source> & { name: string; kind: any });
          return json({ ok: true, id: r.source.id, created: r.created, reason: r.reason });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    // ------------------------------------------------------------- archive ----
    // A scheduled run has no CLI to post its report, so the agent files its own.
    // Without this, cron sweeps would only exist in the Console transcript.
    server.tool(
      "sweeps_archive",
      "File your finished sweep report to the board so it appears in the sweep history. Call this ONCE, at the very end, after everything else — the report you pass should be the same complete report you deliver. Safe to call again with the same id if you need to correct it.",
      {
        session_id: z.string().describe("A stable id for this run. Use your Managed Agents session id if you know it; otherwise a date-based id like '2026-08-20-sweep' is fine. It is the archive key — reuse the same value to correct an entry rather than filing a second one."),
        report: z.string().describe("The complete sweep report, markdown, machine-readable blocks included."),
        kind: z.enum(["bootstrap", "sweep", "custom"]).default("sweep"),
      },
      async ({ session_id, report, kind }) => {
        try {
          const existing = await readSweep(session_id);
          await saveSweep({
            id: session_id,
            // Preserve the original run time if this is a correction.
            ran_at: existing?.ran_at ?? new Date().toISOString(),
            kind: (kind as any) ?? existing?.kind ?? "sweep",
            // The grader runs AFTER the agent stops, so a self-filed record can't know
            // its own verdict. `npm run reconcile-sweeps` backfills it later.
            verdict: existing?.verdict,
            verdict_notes: existing?.verdict_notes,
            report,
            stats: parseStats(report),
          });
          return json({ ok: true, id: session_id, updated: Boolean(existing) });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );

    server.tool(
      "sources_update",
      "Record what happened when you used a source: whether you could reach it, and whether it produced anything. This is how the registry learns which sources are worth the budget — a source that has been dry for months should be reported as such.",
      {
        id: z.string(),
        reach: z.enum(REACHES as [string, ...string[]]).optional(),
        reach_notes: z.string().optional(),
        produced_finds: z.number().optional().describe("Running count of confirmed shows this source has surfaced"),
        last_checked: z.string().optional().describe("yyyy-mm-dd"),
        where_posted: z.string().optional(),
      },
      async ({ id, ...fields }) => {
        try {
          const updated = await patchSourceAgent(id, fields as Partial<Source>);
          if (!updated) return err(`no source with id "${id}"`);
          return json({ ok: true, id: updated.id });
        } catch (e) {
          return err((e as Error).message);
        }
      },
    );
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST, handler as DELETE };
