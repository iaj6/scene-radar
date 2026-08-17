// Run one sweep. Creates a session against the provisioned radar agent, sends the
// graded kickoff, streams the report, saves it to sweeps/.
//
//   npm run sweep                      # normal weekly sweep
//   npm run sweep -- --bootstrap       # first run: seed memory from the taste profile,
//                                      # and research candidate venues/promoters to
//                                      # propose for the source registry
//   npm run sweep -- "<mission>"       # ad-hoc: any instruction, still graded
//   npm run sweep -- --attach sesn_01… # reattach to a session already running
//
// Sessions are created every run; the agent is NOT. model/system/tools live on the
// agent object, and this script only points at it by ID.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { defineOutcome } from "./lib/rubrics.ts";
import { fetchDeliverable } from "./lib/outputs.ts";

const IDS = ".scene-radar.json";
if (!existsSync(IDS)) {
  console.error("No .scene-radar.json — run `npm run setup` first.");
  process.exit(1);
}
const ids = JSON.parse(readFileSync(IDS, "utf8"));

const argv = process.argv.slice(2);
const bootstrap = argv.includes("--bootstrap");
const attachIdx = argv.indexOf("--attach");
const attachTo = attachIdx >= 0 ? argv[attachIdx + 1] : undefined;
const custom = argv
  .filter((a, i) => !a.startsWith("--") && i !== attachIdx + 1)
  .join(" ");

// A graded session is NOT done when it first goes idle — the grader runs after the
// agent stops, and `needs_revision` sends it back for another cycle. Only these
// verdicts end the work.
const TERMINAL_VERDICTS = new Set(["satisfied", "max_iterations_reached", "failed", "interrupted"]);

const BOOTSTRAP_MISSION = `This is the FIRST sweep against an empty board. Bootstrap it:

1. Call bands_list. If the roster is empty, seed it: call bands_suggest for every band
   named in the taste profile, using the taste profile itself as the edge source
   (edge "same scene", edge_detail naming the tier and region it lists). The human will
   tier them from the UI.
2. Run a full check on the tier 1 bands and record everything you learn with
   bands_update — canonical_url above all, since identity settled once is reused forever.
3. Propose sources with sources_propose: venues, promoters and regional listers covering
   the taste profile's rings, focusing on SMALL rooms and DIY promoters rather than
   anything the aggregators already carry. Be honest in \`reach\` about whether you
   actually loaded each page. Nothing you propose becomes a source until the human
   adopts it.
4. Write _learnings.md with which sources you could and could not reach.

Report per the format in your sweep protocol skill.`;

const NORMAL_MISSION = `Run this week's sweep. Follow your scene-sweep-protocol skill
exactly: read the board first (bands_list due_only, the dismissed list, shows_list,
sources_list), then work the due bands in tier order, delegating each to your Band
Mapper. Call bands_update for every band you check, including the ones where you find
nothing. Node-search with bands_suggest only if budget remains after the due roster is
done.`;

// The system prompt and sweep-protocol skill both tell the agent to work the shows
// board. Until `npm run setup-mcp` runs, those tools don't exist on the agent — say so
// up front rather than letting it burn turns discovering the gap.
// Without the board the agent has no roster at all, so this note has to supply the
// fallback rather than just naming the missing tools.
const NO_BOARD = `\n\nNOTE: the board is NOT connected this run — you have no bands_*,
shows_* or sources_* tools. Skip every board step in your sweep protocol. Take the
roster from the tier lists in the taste profile above, and put everything you find in
the REPORT only. Do not treat the missing tools as an error, and do not try to reach the
board over bash or web_fetch.`;

const mission =
  (custom || (bootstrap ? BOOTSTRAP_MISSION : NORMAL_MISSION)) + (ids.boardUrl ? "" : NO_BOARD);

const client = new Anthropic();

let sessionId: string;
if (attachTo) {
  sessionId = attachTo;
  console.log(`attaching → ${sessionId}\n`);
} else {
  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: ids.radarAgentId, version: ids.radarAgentVersion },
    environment_id: ids.environmentId,
    title: bootstrap ? "Scene radar — bootstrap" : "Scene radar — sweep",
    resources: [
      {
        type: "memory_store",
        memory_store_id: ids.memoryStoreId,
        access: "read_write",
        instructions:
          "Your notebook: _learnings.md (sourcing lessons across sweeps) and per-band " +
          "narrative notes. The roster, shows and source registry live on the board, " +
          "not here — do not keep a second copy of them, it will drift.",
      },
    ],
  });
  sessionId = session.id;
  console.log(`session → ${sessionId}`);
  console.log(`trace   → https://platform.claude.com/workspaces/default/sessions/${sessionId}\n`);

  // Stream FIRST, then send — the stream only delivers events emitted after it opens.
  const s = await client.beta.sessions.events.stream(sessionId);
  await client.beta.sessions.events.send(sessionId, { events: [defineOutcome("radar", mission)] });
  await consume(s);
}

if (attachTo) await consume(await client.beta.sessions.events.stream(sessionId));

// The live stream is PROGRESS ONLY. It can drop mid-run (HTTP/2 reset, session
// reschedule) while the session keeps going server-side, and the async iterator just
// ends rather than throwing — so never treat "iterator finished" as "work finished".
// Whatever happens here, the poll + rebuild below is what actually decides.
async function consume(stream: AsyncIterable<any>): Promise<void> {
  try {
    for await (const event of stream) {
      switch (event.type) {
        case "agent.message":
          for (const block of event.content ?? []) {
            if (block.type === "text") process.stdout.write(block.text);
          }
          break;
        case "agent.tool_use":
        case "agent.mcp_tool_use":
          process.stdout.write(`\n  · ${event.name}…\n`);
          break;
        case "session.thread_created":
          process.stdout.write(`\n  ⑂ mapper thread: ${event.agent_name ?? "?"}\n`);
          break;
        case "span.outcome_evaluation_start":
          process.stdout.write(`\n  ⚖ grading (cycle ${event.iteration + 1})…\n`);
          break;
        case "span.outcome_evaluation_end":
          process.stdout.write(`\n  ⚖ ${event.result}: ${event.explanation ?? ""}\n`);
          break;
        case "session.error":
          process.stderr.write(`\n[session error] ${event.error?.message ?? "unknown"}\n`);
          break;
      }
    }
  } catch (e) {
    process.stderr.write(`\n(stream dropped: ${e instanceof Error ? e.message : e})\n`);
  }
}

// Poll to a genuinely terminal state. Idle alone is not it: the session goes idle
// between the agent finishing and the grader running, and again between revision
// cycles. Wait for every outcome evaluation to carry a terminal verdict.
process.stdout.write("\n\n(waiting for the grader to finish…)\n");
let verdict = "";
while (true) {
  const s = await client.beta.sessions.retrieve(sessionId);
  const evals = (s as any).outcome_evaluations ?? [];
  const done =
    s.status === "terminated" ||
    (s.status === "idle" && evals.length > 0 && evals.every((o: any) => TERMINAL_VERDICTS.has(o.result)));
  if (done) {
    const graded = evals.filter((o: any) => o.completed_at).pop();
    if (graded) verdict = `${graded.result} — ${graded.explanation ?? ""}`;
    break;
  }
  await new Promise((r) => setTimeout(r, 15_000));
}

// Rebuild the report from the server-side event log — authoritative, and it covers
// anything the stream missed while it was disconnected.
let report = "";
for await (const ev of client.beta.sessions.events.list(sessionId, { limit: 100 })) {
  if (ev.type === "agent.message")
    for (const block of (ev as any).content ?? []) if (block.type === "text") report += block.text;
}

const deliverable = await fetchDeliverable(client, sessionId);
const body = deliverable ?? report;
const kind = bootstrap ? "bootstrap" : custom ? "custom" : "sweep";

mkdirSync("sweeps", { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const path = `sweeps/${stamp}-${kind}.md`;
writeFileSync(path, verdict ? `${body}\n\n---\n_grader: ${verdict}_\n` : body);
console.log(`\n${verdict ? `grader → ${verdict}\n` : ""}saved  → ${path}`);

// Archive to the board so the history lives with everything else the sweep produced,
// rather than only on whichever laptop happened to run the CLI. Best-effort: a board
// that is down must never lose you the local copy above.
if (ids.boardUrl && process.env.INGEST_TOKEN) {
  try {
    const res = await fetch(new URL("/api/sweeps", ids.boardUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.INGEST_TOKEN}`,
      },
      body: JSON.stringify({
        id: sessionId,
        ran_at: new Date().toISOString(),
        kind,
        verdict: verdict.split(" — ")[0] || undefined,
        verdict_notes: verdict.split(" — ").slice(1).join(" — ") || undefined,
        mission,
        report: body,
      }),
    });
    console.log(res.ok ? `archived → ${ids.boardUrl}/sweeps/${sessionId}` : `archive failed: ${res.status}`);
  } catch (e) {
    console.log(`archive failed: ${e instanceof Error ? e.message : e}`);
  }
} else if (ids.boardUrl) {
  console.log("(not archived — set INGEST_TOKEN to post sweeps to the board)");
}
