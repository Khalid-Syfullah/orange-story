// The story's passes, in the order they are registered. Each chapter pass claims its segments from
// src/stage/script.ts; the placeholder claims "all" and draws only the segments nobody else has.
// Later phases add their pass here (one fragment shader per chapter group is fine).
import type { PassDef } from "../gl/passes";
import { bridgePass } from "./bridge";
import { matchcutPass, questionsPass } from "./canopy";
import { closePass, codaPass } from "./coda";
import { heroPass } from "./hero";
import { modelPass } from "./model";
import { parchmentPass } from "./parchment";
import { placeholderPass } from "./placeholder";
import { sheetPass } from "./sheet";
import { splitPass } from "./split";
import { termsPass } from "./terms";
import { workPass } from "./work";

// The first pass to claim a segment draws it, so a pass that takes a segment from a more general one
// comes before it here (terms takes `drawing` and `panel`, which the sheet no longer claims; the
// close takes `close` and the coda `coda` from the placeholder; the match cut and the chapter take
// `matchcut` and `questions` the same way).
export const storyPasses: readonly PassDef[] = [
  heroPass,
  bridgePass,
  modelPass,
  splitPass,
  workPass,
  parchmentPass,
  termsPass,
  closePass,
  codaPass,
  matchcutPass,
  questionsPass,
  sheetPass,
  placeholderPass,
];
