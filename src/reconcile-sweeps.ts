// Backfill grader verdicts onto self-archived sweeps.
//
//   npm run reconcile-sweeps
//
// A scheduled sweep files its own report via `sweeps_archive` — but the grader runs
// AFTER the agent stops, so the agent physically cannot know its own verdict at the
// moment it writes. This walks recent deployment runs, reads each session's terminal
// outcome evaluation, and patches the verdict onto the archived record.
//
// Run it whenever, or on a lag behind the cron. Idempotent: a record that already has
// a verdict is left alone.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync("shows/.env.local")) process.loadEnvFile("shows/.env.local");

const ids = JSON.parse(readFileSync(".scene-radar.json", "utf8"));
const { INGEST_TOKEN } = process.env;
if (!ids.deploymentId) { console.error("No deployment — nothing to reconcile."); process.exit(1); }
if (!ids.boardUrl || !INGEST_TOKEN) {
  console.error("Need boardUrl in .scene-radar.json and INGEST_TOKEN (see shows/.env.local).");
  process.exit(1);
}

const TERMINAL = new Set(["satisfied", "max_iterations_reached", "failed", "interrupted"]);
const client = new Anthropic();

// What the board already has, so we only touch records missing a verdict.
const archived: Record<string, any> = {};
const res = await fetch(new URL("/api/sweeps", ids.boardUrl), {
  headers: { authorization: `Bearer ${INGEST_TOKEN}` },
});
if (!res.ok) {
  console.error(`Could not read the sweep archive: ${res.status} ${await res.text()}`);
  console.error("Bailing rather than reporting every sweep as unarchived.");
  process.exit(1);
}
const all: any[] = await res.json();
for (const s of all) archived[s.id] = s;

let checked = 0, patched = 0;
const claimed = new Set<string>();
for await (const run of client.beta.deploymentRuns.list({ deployment_id: ids.deploymentId } as any)) {
  const r = run as any;
  if (!r.session_id || checked++ >= 20) continue;

  let rec = archived[r.session_id];
  if (!rec) {
    // The agent files under whatever id it picked, so match on proximity: the sweep
    // filed closest to this run, within two hours, and not already claimed.
    const runAt = new Date(r.created_at).getTime();
    const near = all
      .filter((s) => !s.verdict && !claimed.has(s.id))
      .map((s) => ({ s, gap: Math.abs(new Date(s.ran_at).getTime() - runAt) }))
      .filter((x) => x.gap < 2 * 3600_000)
      .sort((a, b) => a.gap - b.gap)[0];
    if (near) {
      rec = near.s;
      console.log(`  (matched run ${r.session_id} → archived "${rec.id}" by time, ${Math.round(near.gap / 60000)}m apart)`);
    }
  }
  if (!rec) { console.log(`· ${r.session_id} — no archived report found`); continue; }
  claimed.add(rec.id);
  if (rec.verdict) { console.log(`· ${r.session_id} — already has verdict "${rec.verdict}"`); continue; }

  const session: any = await client.beta.sessions.retrieve(r.session_id).catch(() => null);
  const graded = (session?.outcome_evaluations ?? [])
    .filter((o: any) => o.completed_at && TERMINAL.has(o.result))
    .pop();
  if (!graded) { console.log(`· ${r.session_id} — no terminal verdict yet`); continue; }

  // PATCH, not POST: the list endpoint strips `report`, so round-tripping a record
  // through it would blank what the agent actually filed.
  const full = await fetch(new URL(`/api/sweeps`, ids.boardUrl), {
    method: "PATCH",
    headers: { authorization: `Bearer ${INGEST_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: rec.id,
      verdict: graded.result,
      verdict_notes: graded.explanation ?? undefined,
    }),
  });
  console.log(`${full.ok ? "✓" : "✗"} ${rec.id} → ${graded.result}`);
  if (full.ok) patched++;
}
console.log(`\n${patched} verdict${patched === 1 ? "" : "s"} backfilled.`);
