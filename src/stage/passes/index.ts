// The story's passes, in the order they are registered. Each chapter pass claims its segments from
// src/stage/script.ts; the placeholder claims "all" and draws only the segments nobody else has.
// Later phases add their pass here (one fragment shader per chapter group is fine).
import type { PassDef } from "../gl/passes";
import { bridgePass } from "./bridge";
import { heroPass } from "./hero";
import { modelPass } from "./model";
import { parchmentPass } from "./parchment";
import { placeholderPass } from "./placeholder";
import { sheetPass } from "./sheet";
import { splitPass } from "./split";
import { workPass } from "./work";

// The first pass to claim a segment draws it: a pass that takes `drawing` or `panel` from the
// sheet must come before sheetPass here.
export const storyPasses: readonly PassDef[] = [
  heroPass,
  bridgePass,
  modelPass,
  splitPass,
  workPass,
  parchmentPass,
  sheetPass,
  placeholderPass,
];
