// Seed the board from sweeps that already ran.
//
//   BOARD_URL=… BOARD_PASSWORD=… MCP_TOKEN=… INGEST_TOKEN=… npm run seed-board
//
// The two completed sweeps emitted typed `band` / `show` / `node` blocks and a graded
// report. Rather than retype any of that — which would be a fresh chance to introduce
// exactly the kind of wrong-band error this project is built to avoid — this parses
// those blocks and pushes them through the SAME doors everything else uses:
//
//   bands    → POST /api/bands (Basic auth, human) then bands_update over MCP
//   shows    → shows_add over MCP
//   nodes    → bands_suggest over MCP
//   reports  → POST /api/sweeps (ingest bearer)
//
// Going through the real doors means the seed also end-to-end tests every auth path
// and every validation rule. Idempotent: re-running upserts rather than duplicating.

import { readFileSync, readdirSync, existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync("shows/.env.local")) process.loadEnvFile("shows/.env.local");

const ids = JSON.parse(readFileSync(".scene-radar.json", "utf8"));
const BOARD = process.env.BOARD_URL || ids.boardUrl;
const { BOARD_PASSWORD, MCP_TOKEN, INGEST_TOKEN } = process.env;

if (!BOARD || !BOARD_PASSWORD || !MCP_TOKEN || !INGEST_TOKEN) {
  console.error("Need BOARD_URL, BOARD_PASSWORD, MCP_TOKEN and INGEST_TOKEN.");
  console.error("They're in shows/.env.local after a deploy.");
  process.exit(1);
}

// The roster is the human's call, not the agent's, so it comes from local config
// rather than from anything the agent can write. config/roster.json is the structured
// half of the taste profile — see config/README.md.
type RosterBand = {
  name: string;
  tier: 1 | 2 | 3;
  lineup_qualifier?: string;
  // No socials, no Bandcamp, no website — usually because the band ended before social
  // media. The "dormant account wakes up" signal can never fire for these.
  no_surface?: boolean;
};

if (!existsSync("config/roster.json")) {
  console.error("Missing config/roster.json — run `npm run init-config`, then fill it in.");
  process.exit(1);
}
const roster: RosterBand[] = JSON.parse(readFileSync("config/roster.json", "utf8")).bands;

const TIERS = new Map(roster.map((b) => [b.name, b.tier]));
const QUALIFIERS = new Map(
  roster.filter((b) => b.lineup_qualifier).map((b) => [b.name, b.lineup_qualifier!]),
);
const NO_SURFACE = new Set(roster.filter((b) => b.no_surface).map((b) => b.name));

const basic = "Basic " + Buffer.from(`x:${BOARD_PASSWORD}`).toString("base64");

async function mcp(tool: string, args: Record<string, unknown>) {
  const res = await fetch(new URL("/api/mcp", BOARD), {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const payload = JSON.parse((line ?? text).replace(/^data: /, ""));
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  const c = payload.result?.content?.[0]?.text ?? "";
  if (payload.result?.isError) throw new Error(c);
  return c;
}

// Vercel Blob is eventually consistent: a record written a moment ago can still read
// as absent. Only worth retrying the not-found case — a validation error will never
// become valid on a second try.
async function mcpAfterWrite(tool: string, args: Record<string, unknown>, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      return await mcp(tool, args);
    } catch (e) {
      const msg = (e as Error).message;
      if (i >= tries - 1 || !/no band with slug|no show with id|no source with id/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

// Parse every fenced block of a kind out of every sweep report, oldest first, so a
// later sweep's findings overwrite an earlier one's for the same band.
function blocks(kind: string): { file: string; data: any }[] {
  const out: { file: string; data: any }[] = [];
  for (const f of readdirSync("sweeps").filter((f) => f.endsWith(".md")).sort()) {
    const txt = readFileSync(`sweeps/${f}`, "utf8");
    for (const m of txt.matchAll(new RegExp("```" + kind + "\\n(.*?)\\n```", "gs"))) {
      try {
        out.push({ file: f, data: JSON.parse(m[1]) });
      } catch {
        console.warn(`  ! unparseable ${kind} block in ${f}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- bands ----
console.log("BANDS");
const bandBlocks = blocks("band");
const latest = new Map<string, any>();
for (const { data } of bandBlocks) latest.set(data.band, data); // later sweep wins

// Every band named in the taste profile gets a row, even ones no sweep reached yet.
for (const name of TIERS.keys()) if (!latest.has(name)) latest.set(name, { band: name });

for (const [name, d] of latest) {
  const tier = TIERS.get(name);
  if (!tier) continue; // roster tiers only; discovered bands go through bands_suggest
  try {
  const created = await fetch(new URL("/api/bands", BOARD), {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/json" },
    body: JSON.stringify({
      name, tier, listed: "active",
      lineup_qualifier: QUALIFIERS.get(name),
    }),
  });
  if (!created.ok) { console.log(`  ✗ ${name}: ${created.status}`); continue; }
  const { slug } = await created.json();

  // Research fields go through the agent's own door, so the human/agent split is
  // exercised rather than bypassed.
  if (d.canonical_url || d.status || d.signal) {
    await mcpAfterWrite("bands_update", {
      slug,
      canonical_url: d.canonical_url,
      identity: d.identity,
      band_status: d.status,
      signal: d.signal,
      sources: d.sources,
      last_checked: d.last_checked,
      recheck: d.recheck,
      no_surface: NO_SURFACE.has(name) || undefined,
    });
  }
  console.log(`  ✓ T${tier} ${name}${d.canonical_url ? "" : "  (never checked)"}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${(e as Error).message.slice(0, 140)}`);
  }
}

// ---------------------------------------------------------------- nodes ----
console.log("\nSUGGESTIONS (from node blocks)");
const seen = new Set<string>();
for (const { data: n } of blocks("node")) {
  if (TIERS.has(n.band) || seen.has(n.band)) continue; // already on the roster
  seen.add(n.band);
  try {
  const r = await mcp("bands_suggest", {
    name: n.band,
    connects_to: n.connects_to,
    edge: n.edge,
    edge_detail: n.edge_detail,
    sources: n.sources,
    signal: n.active ? "Active as of the sweep that found it." : undefined,
  });
  console.log(`  ${JSON.parse(r).created ? "✓" : "·"} ${n.band}  (${n.edge} — ${n.connects_to})`);
  } catch (e) {
    console.log(`  ✗ ${n.band}: ${(e as Error).message.slice(0, 140)}`);
  }
}

// ---------------------------------------------------------------- shows ----
console.log("\nSHOWS");
for (const { data: s } of blocks("show")) {
  // The sweep flagged out-of-range finds without reporting them; honour that.
  if (s.in_range === false) { console.log(`  · skipped ${s.band} — out of range, flagged not reported`); continue; }
  try {
    await mcp("shows_add", {
      band: s.band, venue: s.venue ?? "TBD", city: s.city ?? "",
      date: s.date ?? null, confidence: s.confidence,
      tier: s.tier ?? null, in_range: s.in_range, lineup_ok: s.lineup_ok,
      why_now: s.why_now, tickets_url: s.tickets_url, on_sale: s.on_sale,
      sources: s.sources ?? [],
    });
    console.log(`  ✓ ${s.band} — ${s.date ?? "TBD"} ${s.venue ?? ""} [${s.confidence}]`);
  } catch (e) {
    console.log(`  ✗ ${s.band}: ${(e as Error).message.slice(0, 120)}`);
  }
}

// --------------------------------------------------------------- sweeps ----
console.log("\nSWEEP ARCHIVE");
for (const f of readdirSync("sweeps").filter((f) => f.endsWith(".md")).sort()) {
  const report = readFileSync(`sweeps/${f}`, "utf8");
  const verdict = report.match(/_grader:\s*([a-z_]+)/)?.[1];
  const kind = f.includes("bootstrap") ? "bootstrap" : "sweep";
  const res = await fetch(new URL("/api/sweeps", BOARD), {
    method: "POST",
    headers: { authorization: `Bearer ${INGEST_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: `seed-${f.replace(/\.md$/, "")}`,
      ran_at: new Date(`${f.slice(0, 10)}T12:00:00Z`).toISOString(),
      kind, verdict, report,
    }),
  });
  console.log(`  ${res.ok ? "✓" : "✗"} ${f} (${verdict ?? "no verdict"})`);
}

console.log(`\nDone → ${BOARD}`);
