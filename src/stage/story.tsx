"use client";
// The home page's stage: the story passes with the chrome. DOM layers for each chapter's copy are
// added here as children by later phases.
import { HeroCopy } from "./HeroCopy";
import { ModelCopy } from "./ModelCopy";
import { storyPasses } from "./passes";
import { Stage } from "./Stage";
import { TermsCopy } from "./TermsCopy";
import { WorkCopy } from "./WorkCopy";

export function StoryStage() {
  return (
    <Stage passes={storyPasses}>
      <HeroCopy />
      <ModelCopy />
      <WorkCopy />
      <TermsCopy />
    </Stage>
  );
}
