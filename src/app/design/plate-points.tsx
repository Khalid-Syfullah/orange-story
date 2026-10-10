"use client";

import * as React from "react";

import { PLATES, type Pair, type PlateEntry } from "@/art/manifest";
import { Button } from "@/components/ui/button";
import { designPage } from "@/content/copy";
import { cn } from "@/lib/utils";

const labels = designPage.plateLab.points;

/** Plates worth calibrating: every plate with named points, or with an anchor that is not its foot. */
const CANDIDATES = PLATES.filter((p) => p.points || p.anchor[1] < 0.999);

/** Point names to place on a plate: its own, plus the `anchor` the importer lands on the manifest anchor. */
function namesFor(entry: PlateEntry): string[] {
  const names = Object.keys(entry.points ?? {});
  return entry.anchor[1] < 0.999 ? [labels.anchor, ...names] : names;
}

function startPoints(entry: PlateEntry): Record<string, Pair> {
  const out: Record<string, Pair> = {};
  if (entry.anchor[1] < 0.999) out[labels.anchor] = entry.anchor;
  for (const [name, at] of Object.entries(entry.points ?? {})) out[name] = at;
  return out;
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Dev-only: place a plate's named points by hand. Pick a plate (or open its source painting), pick
 * a point, click or drag on the image; the JSON below is the sidecar's `points` block
 * (`art/rig/<scene>/<name>.json`), ready to copy.
 */
export function PlatePoints() {
  const [id, setId] = React.useState<string>(CANDIDATES[0]?.id ?? "");
  const entry = CANDIDATES.find((p) => p.id === id) ?? CANDIDATES[0];
  const [points, setPoints] = React.useState<Record<string, Pair>>(() => (entry ? startPoints(entry) : {}));
  const [active, setActive] = React.useState<string>(() => (entry ? (namesFor(entry)[0] ?? "") : ""));
  const [source, setSource] = React.useState<{ url: string; name: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const frame = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  React.useEffect(() => () => (source ? URL.revokeObjectURL(source.url) : undefined), [source]);

  if (!entry) return null;
  const names = namesFor(entry);

  const choose = (next: string) => {
    const e = CANDIDATES.find((p) => p.id === next);
    if (!e) return;
    setId(next);
    setPoints(startPoints(e));
    setActive(namesFor(e)[0] ?? "");
    setSource(null);
  };

  const place = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !active) return;
    const u = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const v = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    setPoints((p) => ({ ...p, [active]: [round4(u), round4(v)] }));
  };

  const sidecar = JSON.stringify({ points: Object.fromEntries(names.filter((n) => points[n]).map((n) => [n, points[n]])) }, null, 2);
  const [w, h] = entry.size;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <div
          ref={frame}
          className="relative mx-auto cursor-crosshair touch-none bg-sky select-none"
          style={{ aspectRatio: `${w} / ${h}`, maxHeight: "70vh", maxWidth: `calc(70vh * ${w / h})` }}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            place(event);
          }}
          onPointerMove={(event) => dragging.current && place(event)}
          onPointerUp={() => (dragging.current = false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a dev tool showing a local file or a plate as it is */}
          <img src={source?.url ?? entry.src} alt="" className="absolute inset-0 size-full object-fill" draggable={false} />
          {names.map((name) =>
            points[name] ? (
              <span
                key={name}
                className={cn("pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2", name === active ? "border-orange bg-orange/40" : "border-white bg-white/30")}
                style={{ left: `${points[name][0] * 100}%`, top: `${points[name][1] * 100}%` }}
              />
            ) : null,
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <label className="type-label flex flex-col gap-2">
          {labels.plate}
          <select className="type-meta rounded-tag border border-border bg-background p-2 normal-case" value={entry.id} onChange={(e) => choose(e.target.value)}>
            {CANDIDATES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="type-label flex flex-col gap-2">
          {labels.open}
          <input
            type="file"
            accept="image/*"
            className="type-meta normal-case"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setSource({ url: URL.createObjectURL(file), name: file.name });
            }}
          />
          <span className="type-meta normal-case text-muted-foreground">{labels.openHint}</span>
        </label>
        <p className="type-meta normal-case">{source ? labels.onSource(source.name) : labels.onPlate}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="type-label pb-2">{labels.point}</legend>
          {names.map((name) => (
            <Button key={name} type="button" size="sm" variant={name === active ? "secondary" : "outline"} className="justify-between font-mono" onClick={() => setActive(name)}>
              <span>{name}</span>
              <span className="tabular-nums">{points[name] ? labels.readout(points[name][0], points[name][1]) : ""}</span>
            </Button>
          ))}
          <span className="type-meta normal-case text-muted-foreground">{labels.hint}</span>
        </fieldset>
        <pre className="type-meta overflow-auto rounded-tag border border-border p-3 normal-case">{sidecar}</pre>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(sidecar);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? labels.copied : labels.copy}
        </Button>
      </div>
    </div>
  );
}
