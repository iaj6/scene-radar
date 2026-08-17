// Uploads the skills in skills/ and attaches them to the radar. Procedure lives in
// skills, not in the prompt: the system prompt carries identity + taste + sources and
// points at the skills; the skills carry the sweep protocol and the verification
// contract, loaded on demand.
//
//   npm run setup-skills
//
// Idempotent: first run creates each skill (id saved to .scene-radar.json under
// "skills"); later runs push a new skill VERSION from the same folder. Agents
// reference version "latest", so skill-only edits take effect WITHOUT an agent version
// bump — but this script also re-pushes the system prompts, which does bump versions.
//
// Layout rule: each skills/<name>/ folder must contain SKILL.md whose frontmatter
// `name` equals the folder name; every file in the folder uploads under that name.

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { withCanon } from "./lib/taste.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const IDS = ".scene-radar.json";
if (!existsSync(IDS)) {
  console.error("No .scene-radar.json — run `npm run setup` first.");
  process.exit(1);
}
const ids = JSON.parse(readFileSync(IDS, "utf8"));
const client = new Anthropic();
const BETAS = ["skills-2025-10-02" as const];

function skillFiles(dir: string, name: string) {
  const out: { path: string; name: string }[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    out.push({ path: full, name: `${name}/${relative(dir, full)}` });
  }
  return out;
}

ids.skills ??= {};
for (const name of readdirSync("skills")) {
  const files = await Promise.all(
    skillFiles(join("skills", name), name).map((f) => toFile(readFileSync(f.path), f.name)),
  );
  if (!ids.skills[name]) {
    // Adopt a skill that already exists under this display_title (e.g. from a partial
    // earlier run) instead of failing the title-uniqueness check.
    for await (const s of client.beta.skills.list({ betas: BETAS })) {
      if ((s as any).display_title === name) {
        ids.skills[name] = (s as any).id;
        break;
      }
    }
  }
  if (ids.skills[name]) {
    const v = await client.beta.skills.versions.create(ids.skills[name], { files, betas: BETAS });
    console.log(`skill ${name} → ${ids.skills[name]} (new version ${(v as any).version ?? ""})`);
  } else {
    const skill = await client.beta.skills.create({ display_title: name, files, betas: BETAS });
    ids.skills[name] = (skill as any).id;
    console.log(`skill ${name} → ${ids.skills[name]} (created)`);
  }
  writeFileSync(IDS, JSON.stringify(ids, null, 2)); // persist as we go
}

const ref = (name: string) => ({
  type: "custom" as const,
  skill_id: ids.skills[name],
  version: "latest",
});

// Only the coordinator gets skills. The mapper is deliberately narrow — it researches
// one band and reports; the protocol and routing rules aren't its business.
const updated = await client.beta.agents.update(ids.radarAgentId, {
  version: ids.radarAgentVersion,
  system: withCanon("radar", readFileSync("agents/scene-radar.system.md", "utf8")),
  skills: [ref("scene-sweep-protocol"), ref("show-verification")],
});
console.log(
  `radar: ${ids.radarAgentId}  v${ids.radarAgentVersion} → v${updated.version}  (skills attached)`,
);
ids.radarAgentVersion = updated.version;

writeFileSync(IDS, JSON.stringify(ids, null, 2));
console.log("\nPinned .scene-radar.json. Next: npm run sweep -- --bootstrap");
