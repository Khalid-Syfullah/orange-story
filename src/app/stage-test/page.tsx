// Dev-only (not linked): the cover()/uncover() mapping check. See src/stage/dev/StageTest.tsx.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StageTest } from "@/stage/dev/StageTest";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StageTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main>
      <StageTest />
    </main>
  );
}
