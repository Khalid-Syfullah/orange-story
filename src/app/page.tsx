import { ReducedStory } from "@/components/story/reduced-story";
import { StoryStage } from "@/components/story/story-stage";
import { storyYear } from "@/lib/story-year";

/**
 * The whole site: one pinned scroll stage. Visitors who prefer reduced motion get the same story as
 * a calm stacked page instead (CSS picks one; only one is ever displayed).
 */
export default async function Home() {
  const year = await storyYear();
  return (
    <main>
      <StoryStage year={year} />
      <ReducedStory year={year} />
    </main>
  );
}
