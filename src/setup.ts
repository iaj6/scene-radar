// ONE-TIME SETUP — run once, then reuse the IDs it writes.
//
// Creates: the environment (sandbox), the memory store (the radar's brain across
// sweeps), the Band Mapper sub-agent, and the Scene Radar coordinator that delegates
// to it. Saves every ID to .scene-radar.json, which sweep.ts reads.
//
//   npm run setup
//
// Agents are persisted, versioned objects — created ONCE here, referenced by ID on
// every session. To change behavior later, edit the .system.md and run `npm run update`
// (which bumps the agent version); never re-run this script to "reload" a prompt.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { withCanon } from "./lib/taste.ts";

const IDS = ".scene-radar.json";
const MODEL = "claude-opus-5";

if (existsSync(IDS)) {
  console.log(`${IDS} already exists — everything is provisioned.`);
  console.log("Delete it if you want to re-create from scratch, or run `npm run update`");
  console.log("to push prompt changes to the existing agents.");
  process.exit(0);
}

const client = new Anthropic(); // ANTHROPIC_API_KEY, or your `ant auth login` profile

// Environment = the cloud sandbox tools run in. Unrestricted networking because the
// whole job is fetching venue calendars, Bandcamp pages, and label sites.
const env = await client.beta.environments.create({
  name: "scene-research",
  config: { type: "cloud", networking: { type: "unrestricted" } },
});
console.log(`environment  → ${env.id}`);

// Memory store = the radar's roster and history. Mounted at /mnt/memory/scene/.
// The description is shown to the agent — write it for the model.
const store = await client.beta.memoryStores.create({
  name: "scene",
  description:
    "The band watchlist and everything the radar has learned across sweeps: one card " +
    "per band with its status and sources, the confirmed show calendar, the frontier " +
    "of undiscovered scene-graph candidates, dismissed bands, and sourcing lessons. " +
    "Read it before every sweep; it is how you avoid re-doing work.",
});
console.log(`memory store → ${store.id}`);

// Sub-agent first — the coordinator's roster references it by ID.
// Research tools only: no memory, no skills. It reports; it doesn't decide.
const mapper = await client.beta.agents.create({
  name: "Band Mapper",
  description:
    "Researches ONE band end to end and reports raw findings: upcoming dates with " +
    "confidence labels, whether the band is dormant or stirring, releases, and scene " +
    "edges (members, splits, labels). Hand it a band name, its tier, what's already " +
    "known, and which sources to check — it sees none of your context.",
  model: MODEL,
  system: withCanon("mapper", readFileSync("agents/band-mapper.system.md", "utf8")),
  tools: [
    {
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
      configs: ["read", "glob", "grep", "web_fetch", "web_search"].map((name) => ({
        name,
        enabled: true,
      })),
    },
  ],
});
console.log(`mapper agent → ${mapper.id} (v${mapper.version})`);

// Coordinator. `multiagent` is a top-level field on the agent — not a tools[] entry,
// and not something the session sets.
const radar = await client.beta.agents.create({
  name: "Scene Radar",
  description: "Monitors a roster of small bands for tour dates the aggregators miss.",
  model: MODEL,
  system: withCanon("radar", readFileSync("agents/scene-radar.system.md", "utf8")),
  tools: [{ type: "agent_toolset_20260401" }],
  multiagent: { type: "coordinator", agents: [mapper.id] },
});
console.log(`radar agent  → ${radar.id} (v${radar.version})`);

writeFileSync(
  IDS,
  JSON.stringify(
    {
      environmentId: env.id,
      memoryStoreId: store.id,
      mapperAgentId: mapper.id,
      mapperAgentVersion: mapper.version,
      radarAgentId: radar.id,
      radarAgentVersion: radar.version,
    },
    null,
    2,
  ),
);
console.log(`\nWrote ${IDS}.`);
console.log("Next: `npm run init-config`, fill in config/taste.md, then `npm run setup-skills`,");
console.log("then `npm run sweep -- --bootstrap` to seed memory and the source registry.");
