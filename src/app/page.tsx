import { model } from "@/content/copy";

/**
 * Holding page until the scroll story lands (phases 3 onward replace this with the pinned stage).
 */
export default function Home() {
  return (
    <main className="theme-sky relative flex min-h-dvh flex-col justify-center bg-background text-foreground">
      <div className="pl-col-a pr-6">
        <h1 className="type-display-xl max-w-[12ch]">{model.hero.title}</h1>
        <p className="type-lead mt-6 max-w-[34ch] text-milk">{model.hero.subtitle}</p>
      </div>
    </main>
  );
}
