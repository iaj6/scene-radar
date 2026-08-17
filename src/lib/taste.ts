// Compose an agent's final system prompt = taste profile + source registry + the
// agent's own behavior spec.
//
// The criteria for "what counts as a hit" live in ONE place (config/taste.md) and the
// list of places worth looking lives in ONE place (config/sources.md), so they can't
// drift between agents. Both are gitignored local config — see config/README.md.
//
// Every place that pushes an agent version runs its system.md through here. Edit the
// markdown, re-run `npm run update`, and every agent's judgment moves with it.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TASTE = resolve(ROOT, "config/taste.md");
const SOURCES = resolve(ROOT, "config/sources.md");

// The mapper is deliberately starved of context — it researches one band from the
// task it's handed and returns raw findings. Giving it the taste profile would
// invite it to make judgment calls that belong to the coordinator.
export type Consumer = "radar" | "mapper";

export function withCanon(consumer: Consumer, systemMd: string): string {
  if (consumer === "mapper") return systemMd;

  for (const f of [TASTE, SOURCES]) {
    if (!existsSync(f)) {
      throw new Error(
        `Missing ${f}\n` +
          `Run \`npm run init-config\` to create it from the template, then fill it in.`,
      );
    }
  }

  const taste = readFileSync(TASTE, "utf8");
  const sources = readFileSync(SOURCES, "utf8");

  return [
    "# Taste profile (authoritative — what counts as a hit)",
    taste,
    "# Source registry (authoritative — where to look)",
    sources,
    "# Your job",
    systemMd,
  ].join("\n\n");
}
