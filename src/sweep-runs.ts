// Recent firings of the weekly cron — did it run, did it work, what did it produce.
//
//   npm run sweep-runs              # last 10 runs
//   npm run sweep-runs -- --errors  # only the failures
//
// A deployment run records either a created session or an error explaining why no
// session was created (archived agent, missing vault, rate limit). Those failures are
// silent otherwise: the schedule just doesn't produce anything and nothing tells you.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const ids = JSON.parse(readFileSync(".scene-radar.json", "utf8"));
if (!ids.deploymentId) {
  console.error("No deployment — run `npm run deploy-sweep` first.");
  process.exit(1);
}

const errorsOnly = process.argv.includes("--errors");
const client = new Anthropic();

const d: any = await client.beta.deployments.retrieve?.(ids.deploymentId).catch(() => null);
if (d) {
  console.log(`deployment ${ids.deploymentId}`);
  console.log(`  status:   ${d.status}${d.paused_reason ? ` (${d.paused_reason.type})` : ""}`);
  console.log(`  schedule: ${d.schedule?.expression} ${d.schedule?.timezone}`);
  console.log(`  next:     ${d.schedule?.upcoming_runs_at?.slice(0, 3).join(", ") ?? "—"}\n`);
}

let n = 0;
for await (const run of client.beta.deploymentRuns.list({
  deployment_id: ids.deploymentId,
  ...(errorsOnly ? { has_error: true } : {}),
} as any)) {
  const r = run as any;
  const when = r.created_at?.slice(0, 16).replace("T", " ");
  const trigger = r.trigger_context?.type ?? "?";
  if (r.error) {
    console.log(`✗ ${when}  ${trigger.padEnd(9)} ${r.error.type}: ${r.error.message ?? ""}`);
  } else {
    console.log(`✓ ${when}  ${trigger.padEnd(9)} ${r.session_id}`);
    if (ids.boardUrl) console.log(`             ${ids.boardUrl}/sweeps/${r.session_id}`);
  }
  if (++n >= 10) break;
}
if (n === 0) console.log(errorsOnly ? "No failed runs." : "No runs yet.");
