import { StoryStage } from "@/stage/story";

// The home page mounts the stage (src/stage/). Chapter passes and copy layers arrive in later phases.
export default function Home() {
  return (
    <main>
      <StoryStage />
    </main>
  );
}
