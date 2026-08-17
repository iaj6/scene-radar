// Re-reads each agent's system .md (plus taste/sources) and pushes it as a NEW agent
// version. Each update is immutable and versioned — running sessions keep their pinned
// version; new sessions get whatever .scene-radar.json points to.
//
//   npm run update           # both agents
//   npm run update -- radar  # just the coordinator
//   npm run update -- mapper # just the sub-agent
//
// Run this after editing config/taste.md or config/sources.md — those are baked into
// the radar's system prompt at push time, so edits don't take effect until you do.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { withCanon, type Consumer } from "./lib/taste.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const IDS = ".scene-radar.json";
if (!existsSync(IDS)) {
  console.error("No .scene-radar.json — run `npm run setup` first.");
  process.exit(1);
}
const ids = JSON.parse(readFileSync(IDS, "utf8"));
const which = process.argv.slice(2).join(" ").trim().toLowerCase();

const client = new Anthropic();

const agents: Record<
  string,
  { idKey: string; verKey: string; file: string; consumer: Consumer }
> = {
  radar: {
    idKey: "radarAgentId",
    verKey: "radarAgentVersion",
    file: "agents/scene-radar.system.md",
    consumer: "radar",
  },
  mapper: {
    idKey: "mapperAgentId",
    verKey: "mapperAgentVersion",
    file: "agents/band-mapper.system.md",
    consumer: "mapper",
  },
};

for (const [name, a] of Object.entries(agents)) {
  if (which && which !== name) continue;
  const id = ids[a.idKey];
  if (!id) continue; // not provisioned
  const system = withCanon(a.consumer, readFileSync(a.file, "utf8"));
  const updated = await client.beta.agents.update(id, { version: ids[a.verKey], system });
  console.log(`${name}: ${id}  v${ids[a.verKey]} → v${updated.version}`);
  ids[a.verKey] = updated.version;
}

writeFileSync(IDS, JSON.stringify(ids, null, 2));
console.log("Pinned .scene-radar.json to the new versions.");
