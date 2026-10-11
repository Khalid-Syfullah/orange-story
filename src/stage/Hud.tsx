"use client";
// ?hud: a dev readout over the stage. Written through a ref from the frame subscription; it is
// rendered hidden and switched on in an effect so server and client markup match.
import { useEffect, useRef } from "react";
import { useStage } from "./hub";

export function Hud() {
  const ref = useRef<HTMLPreElement>(null);
  const hub = useStage();

  useEffect(() => {
    const el = ref.current;
    if (!el || !new URLSearchParams(window.location.search).has("hud")) return;
    el.hidden = false;
    let count = 0;
    let ema = 0;
    let windowStart = performance.now();
    let windowUploads = -1;
    let uploadsPerSecond = 0;
    return hub.subscribe((f) => {
      ema += (f.ms - ema) * 0.1;
      const engine = hub.engine;
      const uploads = engine?.textures?.uploads ?? 0;
      const now = performance.now();
      if (windowUploads < 0) windowUploads = uploads;
      if (now - windowStart >= 1000) {
        uploadsPerSecond = ((uploads - windowUploads) * 1000) / (now - windowStart);
        windowStart = now;
        windowUploads = uploads;
      }
      if (++count % 3 !== 0) return;
      const stats = engine?.textures?.stats() ?? { textures: 0, decoded: 0, frames: 0 };
      const mpx = (f.res[0] * f.res[1]) / 1e6;
      el.textContent = [
        `p ${f.p.toFixed(4)}  seg ${f.segment.id}  t ${f.t.toFixed(3)}`,
        `pass ${engine?.passes?.lastPassId ?? (f.glOff ? "nogl" : "fallback")}  cpu ${ema.toFixed(2)} ms  dt ${f.dt.toFixed(1)} ms`,
        `vel ${(f.vel >= 0 ? "+" : "") + f.vel.toFixed(1)} px/f  mode ${engine?.scroll.mode ?? "-"}  reduced ${f.reduced ? 1 : 0}  still ${f.still}  kick ${f.kick.toFixed(2)}`,
        `dpr ${f.dpr.toFixed(2)}  css ${f.css[0]}x${f.css[1]}  buffer ${f.res[0]}x${f.res[1]} (${mpx.toFixed(2)} Mpx)  oct ${f.octaves}`,
        `tex ${stats.textures}  uploads ${uploadsPerSecond.toFixed(0)}/s (${uploads})  frames ${stats.decoded}/${stats.frames} decoded  mouse ${f.mouse[0].toFixed(2)},${f.mouse[1].toFixed(2)}`,
      ].join("\n");
    });
  }, [hub]);

  return <pre ref={ref} className="hud" hidden aria-hidden="true" />;
}
