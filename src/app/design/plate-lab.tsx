"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useMotionValue } from "motion/react";

import { designPage } from "@/content/copy";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

import { PlatePoints } from "./plate-points";

const PlateLabCanvas = dynamic(() => import("./plate-lab-canvas"), { ssr: false });

const STEPS = 100;
const labels = designPage.plateLab;

/**
 * Dev-only: the plate machinery (morph, plate, twinkle) on one slider, and a points mode to place a
 * plate's named points by hand and copy them as a sidecar (`PlatePoints`).
 */
export function PlateLab() {
  const [mode, setMode] = React.useState<"machinery" | "points">("machinery");
  return (
    <div>
      <div className="flex gap-2 pb-5" role="group">
        {(["machinery", "points"] as const).map((m) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? "secondary" : "outline"} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {labels.modes[m]}
          </Button>
        ))}
      </div>
      {mode === "machinery" ? <Machinery /> : <PlatePoints />}
    </div>
  );
}

function Machinery() {
  const amount = useMotionValue(0.5);
  const [value, setValue] = React.useState(0.5);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-6 pb-5">
        <label id="plate-lab-label" className="type-label shrink-0">
          {labels.slider}
        </label>
        <Slider
          aria-labelledby="plate-lab-label"
          className="max-w-xl flex-1"
          min={0}
          max={STEPS}
          step={1}
          value={[Math.round(value * STEPS)]}
          onValueChange={([v]) => {
            amount.set(v / STEPS);
            setValue(v / STEPS);
          }}
        />
        <p className="type-meta tabular-nums">{labels.readout(value)}</p>
        <p className="type-meta w-full normal-case text-muted-foreground">{labels.hint}</p>
      </div>
      <div className="relative aspect-video w-full overflow-hidden bg-sky">
        <PlateLabCanvas amount={amount} />
      </div>
      <div className="type-meta mt-3 grid grid-cols-3 gap-4 normal-case text-muted-foreground">
        <p>{labels.morph}</p>
        <p className="text-center">{labels.plate}</p>
        <p className="text-right">{labels.twinkle}</p>
      </div>
    </div>
  );
}
