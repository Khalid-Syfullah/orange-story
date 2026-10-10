import { cacheLife } from "next/cache";

/**
 * The current year for the finale's copyright line. Cached (Cache Components), so it is captured in
 * the static shell and refreshed daily instead of being read on every request.
 */
export async function storyYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
