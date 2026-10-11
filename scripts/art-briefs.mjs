#!/usr/bin/env node
// Writes art/briefs/<id>.txt for every id in src/content/art.ts: the style preamble from
// docs/PAINTINGS.md followed by that asset's prompt and motion line, ready to paste into any image
// or video model one at a time. Run again (npm run art:briefs) after editing docs/PAINTINGS.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadArt, ROOT } from "./lib/art-manifest.mjs";

const doc = readFileSync(join(ROOT, "docs", "PAINTINGS.md"), "utf8");
const preamble = (doc.match(/STYLE PREAMBLE[^\n]*\n([\s\S]*?)```/) || [])[1]?.trim();
if (!preamble) throw new Error("no STYLE PREAMBLE block in docs/PAINTINGS.md");

/** The ```text block under `## <heading>`, as trimmed lines. */
function block(heading) {
  const re = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const m = re.exec(doc);
  if (!m) throw new Error(`no "## ${heading}" section in docs/PAINTINGS.md`);
  const rest = doc.slice(m.index + m[0].length);
  const body = (rest.match(/```text\n([\s\S]*?)```/) || [])[1];
  if (!body) throw new Error(`no text block under "## ${heading}"`);
  return body.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Lines of a shared section that belong to one asset: those starting with `tag`, plus MOTION when asked. */
const pick = (lines, tag, motion) => lines.filter((l) => l.startsWith(tag) || (motion && l.startsWith("MOTION")));

const SECTIONS = {
  hero: () => block("hero"),
  bridge: () => block("bridge"),
  graft: () => block("graft"),
  grove: () => block("grove"),
  share: () => block("share"),
  plate: () => block("plate"),
  drawing: () => pick(block("drawing and plan"), "DRAWING", true),
  plan: () => pick(block("drawing and plan"), "PLAN", false),
  coda: () => pick(block("coda and share-orange"), "CODA", true),
  "share-orange": () => pick(block("coda and share-orange"), "SHARE-ORANGE", false),
  canopy: () => block("canopy"),
  application: () => block("application"),
  sapling: () => block("sapling"),
  finale: () => block("finale"),
};

const { ids } = await loadArt();
const dir = join(ROOT, "art", "briefs");
mkdirSync(dir, { recursive: true });
for (const id of ids) {
  const section = SECTIONS[id];
  if (!section) throw new Error(`no brief mapping for "${id}": add it to scripts/art-briefs.mjs`);
  const lines = section();
  if (!lines.length) throw new Error(`empty brief for "${id}"`);
  writeFileSync(join(dir, `${id}.txt`), `${preamble}\n\n${lines.join("\n\n")}\n`);
  console.log(`brief  art/briefs/${id}.txt`);
}
