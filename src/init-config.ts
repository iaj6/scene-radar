// Create the local config files from their committed templates.
//
//   npm run init-config
//
// config/ is the seam between the public project and your private instance: the
// *.example.* files are committed, the real ones are gitignored. See config/README.md.
//
// Never overwrites. Re-running after adding a new template is safe and is the intended
// way to pick one up.

import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), "../config");

const templates = readdirSync(CONFIG).filter((f) => f.includes(".example."));
if (!templates.length) {
  console.error(`No *.example.* templates found in ${CONFIG}`);
  process.exit(1);
}

let created = 0;
for (const t of templates.sort()) {
  const real = t.replace(".example.", ".");
  if (existsSync(resolve(CONFIG, real))) {
    console.log(`  · config/${real} already exists — left alone`);
    continue;
  }
  copyFileSync(resolve(CONFIG, t), resolve(CONFIG, real));
  console.log(`  ✓ config/${real}`);
  created++;
}

console.log(
  created
    ? `\nCreated ${created} file(s). Fill in config/taste.md first — it is injected into\nevery sweep's system prompt, and a vague profile produces a firehose.`
    : "\nNothing to do — every config file already exists.",
);
