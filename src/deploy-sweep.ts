// Put the weekly sweep on a cron. A scheduled deployment fires a session on a
// schedule — no laptop, no CLI, no babysitting.
//
//   npm run deploy-sweep            # create it, or repin an existing one
//   npm run deploy-sweep -- --now   # also fire one run immediately, to prove it works
//
// The deployment pins an EXPLICIT agent version, so any `npm run update` /
// `setup-mcp` / `setup-skills` that bumps the radar must be followed by a re-run of
// this to repin. Re-running is idempotent and cheap.
//
// Why Thursday 07:00 America/New_York:
//   - Small-room tickets usually go on sale Friday morning, so a Thursday sweep gives
//     roughly a day of runway on the break-glass case rather than finding out after.
//   - Morning means it's read the same day instead of sitting overnight.
//   - It stays well clear of the 01:00–03:00 local window, where DST makes a
//     wall-clock schedule either skip a day or fire twice.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { defineOutcome } from "./lib/rubrics.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const IDS = ".scene-radar.json";
if (!existsSync(IDS)) {
  console.error("No .scene-radar.json — run `npm run setup` first.");
  process.exit(1);
}
const ids = JSON.parse(readFileSync(IDS, "utf8"));
if (!ids.boardUrl) {
  console.error("The board isn't wired — run `npm run setup-mcp` first.");
  console.error("An unattended sweep with nowhere to write its findings isn't worth scheduling.");
  process.exit(1);
}

const CRON = "0 7 * * 4"; // Thursday 07:00
const TZ = "America/New_York";

const MISSION = `Run this week's sweep, unattended. Nobody is watching in real time, so
do the whole job in one go and do not stop to ask questions.

Follow your scene-sweep-protocol skill exactly:

1. Read the board first — bands_list with due_only:true is your work queue, plus the
   dismissed list, shows_list, and sources_list. The human curates the roster between
   sweeps, so treat what you find there as authoritative even where it contradicts what
   you remember.
2. Mark any past show still sitting at status "new" as missed.
3. Work the due bands in tier order, delegating each to your Band Mapper. Call
   bands_update for EVERY band you check, including the ones where you find nothing —
   last_checked is how the roster knows the work happened.
4. Push qualifying finds with shows_add. Report on the sources you used with
   sources_update, and propose new ones with sources_propose.
5. Node-search with bands_suggest only if budget remains after the due roster is done.

Then, as the LAST thing you do, call sweeps_archive with this session's id and your
complete report, so the run shows up in the sweep history. Nobody will paste it in for
you on a scheduled run.

If the due roster is empty because nothing is due yet, say so plainly and stop — a short
honest sweep is a good sweep. Do not invent work to fill the run.`;

const client = new Anthropic();

const agent = { type: "agent" as const, id: ids.radarAgentId, version: ids.radarAgentVersion };
const config = {
  name: "Scene radar — weekly sweep",
  agent,
  environment_id: ids.environmentId,
  vault_ids: ids.vaultId ? [ids.vaultId] : undefined, // board MCP credential
  resources: [
    {
      type: "memory_store" as const,
      memory_store_id: ids.memoryStoreId,
      access: "read_write" as const,
      instructions:
        "Your notebook: _learnings.md (sourcing lessons across sweeps) and per-band " +
        "narrative notes. The roster, shows and source registry live on the board, " +
        "not here — do not keep a second copy of them, it will drift.",
    },
  ],
  initial_events: [defineOutcome("radar", MISSION)],
};

if (ids.deploymentId) {
  const d = await client.beta.deployments.update(ids.deploymentId, {
    agent,
    schedule: { type: "cron", expression: CRON, timezone: TZ },
  });
  console.log(`deployment repinned → ${ids.deploymentId} (agent v${ids.radarAgentVersion})`);
  console.log(`next runs: ${(d as any).schedule?.upcoming_runs_at?.slice(0, 3).join(", ") ?? "—"}`);
} else {
  const d = await client.beta.deployments.create({
    ...config,
    schedule: { type: "cron", expression: CRON, timezone: TZ },
  } as any);
  ids.deploymentId = d.id;
  writeFileSync(IDS, JSON.stringify(ids, null, 2));
  console.log(`deployment → ${d.id}  (${CRON} ${TZ}, agent v${ids.radarAgentVersion})`);
  console.log(`status: ${(d as any).status}`);
  console.log(`next runs: ${(d as any).schedule?.upcoming_runs_at?.slice(0, 3).join(", ") ?? "—"}`);
}

if (process.argv.includes("--now")) {
  const run = await client.beta.deployments.run(ids.deploymentId);
  console.log(`\nmanual run → ${(run as any).id}  session ${(run as any).session_id ?? "(creating)"}`);
  console.log("Watch it: npm run sweep-runs");
}

console.log("\nAfter any agent update (update / setup-mcp / setup-skills), re-run this to repin.");
