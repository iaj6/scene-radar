// Points the Scene Radar at the shows board's MCP server, so a sweep pushes what it
// finds into a real place instead of only into a markdown report. Auth is a
// static_bearer vault credential bound to the server URL — the platform attaches it at
// egress and the agent never sees the token.
//
// Idempotent — safe to re-run after prompt or allowlist changes. Steps:
//   1. vault: create it if needed, then ensure a static_bearer credential for the board
//   2. agent: push a new radar version with mcp_servers + an allowlisted mcp_toolset
//      (and the current system prompt, same as `npm run update`)
//
//   BOARD_URL=https://<your-board>.vercel.app MCP_TOKEN=... npm run setup-mcp
//
// Both values can also come from shows/.env.local. The environment needs no change:
// `allow_mcp_servers` only gates `limited` networking, and ours is `unrestricted`.
//
// Only the coordinator gets these tools. The mapper researches one band and reports;
// deciding what reaches the board is judgment, and judgment stays with the radar.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { withCanon } from "./lib/taste.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const IDS = ".scene-radar.json";
if (!existsSync(IDS)) {
  console.error("No .scene-radar.json — run `npm run setup` first.");
  process.exit(1);
}
const ids = JSON.parse(readFileSync(IDS, "utf8"));
if (!ids.radarAgentId) {
  console.error("No radar agent — run `npm run setup` first.");
  process.exit(1);
}

// Fall back to the board's local env file for both values.
const localEnv = existsSync("shows/.env.local") ? readFileSync("shows/.env.local", "utf8") : "";
const fromLocal = (key: string) =>
  localEnv.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

const boardUrl = process.env.BOARD_URL || ids.boardUrl || fromLocal("BOARD_URL");
const mcpToken = process.env.MCP_TOKEN || fromLocal("MCP_TOKEN");

if (!boardUrl) {
  console.error("No BOARD_URL (env var, .scene-radar.json, or shows/.env.local).");
  console.error("Deploy the board first: cd shows && npx vercel --prod");
  process.exit(1);
}
if (!mcpToken) {
  console.error("No MCP_TOKEN (env var or shows/.env.local). Generate one with:");
  console.error("  openssl rand -hex 32");
  console.error("Set it as MCP_TOKEN in the board's Vercel env AND pass it here.");
  process.exit(1);
}

const MCP_URL = new URL("/api/mcp", boardUrl).toString();
const client = new Anthropic();

// 1. Vault + credential.
if (!ids.vaultId) {
  const vault = await client.beta.vaults.create({ display_name: "Scene radar — shows board" });
  ids.vaultId = vault.id;
  writeFileSync(IDS, JSON.stringify(ids, null, 2)); // persist before the credential call
  console.log(`vault      → ${vault.id}`);
}

const existing = await client.beta.vaults.credentials.list(ids.vaultId);
const has = existing.data.some(
  (c: any) => c.auth?.type === "static_bearer" && c.auth?.mcp_server_url === MCP_URL,
);
if (has) {
  console.log("vault: board MCP credential already present — left as-is");
} else {
  const cred = await client.beta.vaults.credentials.create(ids.vaultId, {
    display_name: "Shows board MCP token",
    auth: { type: "static_bearer", token: mcpToken, mcp_server_url: MCP_URL },
  });
  console.log(`credential → ${cred.id}  (${MCP_URL})`);
}

// 2. Agent: mcp_servers + an allowlisted toolset. Allowlist-style (default off, named
// tools on) so the radar can only touch the surface its job needs — notably it gets
// shows_update but NOT delete, because retiring a show is your call, not its.
// always_allow because it runs unattended.
const updated = await client.beta.agents.update(ids.radarAgentId, {
  version: ids.radarAgentVersion,
  system: withCanon("radar", readFileSync("agents/scene-radar.system.md", "utf8")),
  mcp_servers: [{ type: "url", name: "board", url: MCP_URL }],
  tools: [
    { type: "agent_toolset_20260401" },
    {
      type: "mcp_toolset",
      mcp_server_name: "board",
      default_config: { enabled: false },
      configs: [
        // roster — read the watchlist, record research, propose discoveries.
        // NOT granted: any way to set tier or list membership. That's the human's.
        "bands_list", "bands_get", "bands_update", "bands_suggest",
        // shows — add finds, mark past ones missed.
        "shows_list", "shows_get", "shows_add", "shows_update",
        // sources — read the adopted registry, propose candidates, report reach.
        // NOT granted: adopting a source. A hallucinated venue is a hallucinated show.
        "sources_list", "sources_propose", "sources_update",
        // archive — a scheduled run has no CLI to file its report, so it files its own.
        "sweeps_archive",
      ].map((name) => ({
        name,
        enabled: true,
        permission_policy: { type: "always_allow" as const },
      })),
    },
  ],
});
console.log(
  `radar: ${ids.radarAgentId}  v${ids.radarAgentVersion} → v${updated.version}  (mcp: bands·shows·sources·archive, 12 tools)`,
);

ids.radarAgentVersion = updated.version;
ids.boardUrl = boardUrl;
writeFileSync(IDS, JSON.stringify(ids, null, 2));
console.log(`\nPinned ${IDS}. Deploy the board before the next sweep — the tool schema lives there.`);
