"use client";
// The home page's stage: the story passes with the chrome. DOM layers for each chapter's copy are
// added here as children by later phases.
import { storyPasses } from "./passes";
import { Stage } from "./Stage";

export function StoryStage() {
  return <Stage passes={storyPasses} />;
}
