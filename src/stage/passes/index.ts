// The story's passes, in the order they are registered. Each chapter pass claims its segments from
// src/stage/script.ts; the placeholder claims "all" and draws only the segments nobody else has.
// Later phases add their pass here (one fragment shader per chapter group is fine).
import type { PassDef } from "../gl/passes";
import { placeholderPass } from "./placeholder";

export const storyPasses: readonly PassDef[] = [placeholderPass];
