// The pass manager: exactly one full-screen pass per frame, chosen by the active segment.
//
// A pass is a fragment shader plus the textures it needs. One shader per chapter group is fine;
// the manager compiles it (reporting errors), binds its textures, sets the shared uniforms once and
// draws the single triangle. Each pass declares its textures so the manager can tell the texture
// manager which assets are near (the active segment and its neighbours) and preload them.
import { art, type ArtId } from "@/content/art";
import type { FrameCtx } from "../frame";
import { active, nearby, segments, type Segment, type SegmentId } from "../script";
import { COLOR_TOKENS, uniformNameFor, type ColorToken, type RGB } from "../tokens";
import type { GLContext } from "./context";
import { buildProgram, createTriangle, type Program, type Triangle, type UniformSetter } from "./program";
import type { FramesHandle, LoopHandle, StillHandle, TextureManager } from "./textures";

/** How far (in p) around the current position assets count as near and get preloaded. */
export const NEAR_MARGIN = 0.03;

export interface PassTextureDecl {
  /** Sampler uniform in the shader; `${uniform}Size` receives the source size as a vec2. */
  uniform: string;
  asset: ArtId;
  /** `last`: the second keyframe of `share` (the halves held apart). */
  variant?: "last";
  /**
   * Frame sequences only: which frame to aim at for this frame context (fractional allowed).
   * Default: local progress across the whole sequence, `t * (count - 1)`.
   */
  frame?: (ctx: FrameCtx, count: number) => number;
  /**
   * Frame sequences only: which end of the sequence to warm while this pass's segment is merely
   * near (the frame the scroll will enter on). Default: the first frame when the segment is ahead,
   * the last when it is behind. A pass that shows only a sequence's last frame says "last".
   */
  warm?: "first" | "last";
}

export interface PassDef {
  id: string;
  /** Segments this pass draws, or "all" (dev pages, the placeholder). */
  segments: readonly SegmentId[] | "all";
  /** The pass's fragment source; the header and library are prepended by the program builder. */
  frag: string;
  textures?: readonly PassTextureDecl[];
  /**
   * Per-frame uniforms beyond the shared set. Runs after the textures are bound and the sequences
   * have taken their nearest decoded frame, so `textures.frames(id).current` is the frame on screen.
   */
  uniforms?: (ctx: FrameCtx, u: UniformSetter, textures: TextureManager) => void;
  /**
   * The pass has time-driven breath and wants a redraw every frame. Default true. Under reduced
   * motion the engine redraws only when something changed, whatever this says.
   */
  breathes?: boolean;
  /**
   * Anything the pass draws besides its declared textures has arrived (the finale's wordmark waits
   * on its font). The e2e hook asks before it takes a frame; default true.
   */
  settled?: () => boolean;
}

type Handle = StillHandle | LoopHandle | FramesHandle;

interface BoundPass {
  def: PassDef;
  handles: Handle[];
  /** undefined = not compiled yet, null = failed. */
  program?: Program | null;
  /** The e2e probe build (lib.glsl.ts PROBE), compiled only when the hook asks for it. */
  probe?: Program | null;
}

export class PassManager {
  private readonly passes: BoundPass[] = [];
  private readonly bySegment = new Map<SegmentId, BoundPass>();
  private readonly triangle: Triangle;
  private readonly sky: RGB;
  private lastNearKey = "";
  /** The pass drawn last frame, for the HUD. */
  lastPassId: string | null = null;

  constructor(
    private readonly ctx: GLContext,
    private readonly textures: TextureManager,
    defs: readonly PassDef[],
    private readonly colors: Record<ColorToken, RGB>,
  ) {
    this.sky = colors.sky;
    this.triangle = createTriangle(ctx);
    const fallbacks: BoundPass[] = [];
    for (const def of defs) {
      const handles = (def.textures ?? []).map((t) => this.handleFor(t));
      const bound: BoundPass = { def, handles };
      this.passes.push(bound);
      if (def.segments === "all") {
        fallbacks.push(bound);
        continue;
      }
      for (const id of def.segments) {
        if (this.bySegment.has(id)) {
          console.warn(`[stage] segment "${id}" is claimed by two passes; "${def.id}" is ignored for it`);
          continue;
        }
        this.bySegment.set(id, bound);
      }
    }
    // An "all" pass draws whatever no segment-specific pass has claimed (the placeholder, dev pages).
    for (const bound of fallbacks) {
      for (const s of segments) if (!this.bySegment.has(s.id)) this.bySegment.set(s.id, bound);
    }
  }

  private handleFor(decl: PassTextureDecl): Handle {
    const entry = decl.asset;
    if (decl.variant) return this.textures.still(entry, decl.variant);
    switch (kindOf(entry)) {
      case "loop":
        return this.textures.loop(entry);
      case "frames":
        return this.textures.frames(entry);
      default:
        return this.textures.still(entry);
    }
  }

  /** The pass that draws a segment, if any. */
  passFor(segment: Segment): PassDef | undefined {
    return this.bySegment.get(segment.id)?.def;
  }

  /** Compile one not-yet-compiled pass (called once per frame so start-up never stalls). */
  warm(): void {
    const next = this.passes.find((p) => p.program === undefined);
    if (next) this.compile(next);
  }

  private compile(bound: BoundPass): Program | null {
    if (bound.program !== undefined) return bound.program;
    bound.program = buildProgram(this.ctx, bound.def.id, bound.def.frag);
    return bound.program;
  }

  /**
   * Mark the assets of the active and nearby segments as near, so stills load, loops play and
   * sequences decode around their entry frame before the scroll arrives.
   */
  preload(p: number): void {
    const near = new Set<string>();
    const seen = new Set<BoundPass>();
    const aimed = new Set<Handle>();
    const current = this.bySegment.get(active(p).id);
    // A sequence the active pass draws is aimed by that pass's own draw; warming it here too would
    // make two passes pull its decode window back and forth (thrash).
    for (const h of current?.handles ?? []) aimed.add(h);
    for (const seg of nearby(p, NEAR_MARGIN)) {
      const bound = this.bySegment.get(seg.id);
      if (!bound || seen.has(bound)) continue;
      seen.add(bound);
      const decls = bound.def.textures ?? [];
      for (let i = 0; i < bound.handles.length; i++) {
        const h = bound.handles[i];
        near.add(h.key);
        if (h.kind === "frames" && seg.id !== active(p).id && !aimed.has(h)) {
          // Not active yet: warm the frame the scroll will enter on. First pass to ask wins.
          aimed.add(h);
          const warm = decls[i]?.warm ?? (seg.start > p ? "first" : "last");
          h.aim(warm === "first" ? 0 : h.count - 1);
        }
      }
    }
    const key = [...near].sort().join("|");
    if (key !== this.lastNearKey) {
      this.lastNearKey = key;
      this.textures.setNear(near);
    }
  }

  /** Draw the frame: one pass, one triangle. Returns false when it fell back to a flat fill. */
  draw(frame: FrameCtx): boolean {
    const { gl } = this.ctx;
    const bound = this.bySegment.get(frame.segment.id);
    const program = bound ? this.compile(bound) : null;
    if (!bound || !program) {
      this.lastPassId = null;
      gl.clearColor(this.sky[0], this.sky[1], this.sky[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return false;
    }
    this.lastPassId = bound.def.id;
    this.drawWith(bound, program, frame);
    return true;
  }

  /**
   * The e2e probe (docs/CHECKS.md pop and edge tests): draw the frame's pass with its probe build,
   * which writes where the cut's crest is (mode 0) or a printed boundary's mix (mode 1) instead of
   * the picture (lib.glsl.ts PROBE, PROBE_MIX). Built on the first call; nothing on the page ever
   * calls it. False when the pass has no probe build.
   */
  drawProbe(frame: FrameCtx, mode: 0 | 1 = 0): boolean {
    const bound = this.bySegment.get(frame.segment.id);
    if (!bound) return false;
    if (bound.probe === undefined) bound.probe = buildProgram(this.ctx, `${bound.def.id} (probe)`, bound.def.frag, true);
    if (!bound.probe) return false;
    bound.probe.use();
    bound.probe.uniforms.set1f("uProbeMode", mode);
    this.drawWith(bound, bound.probe, frame);
    return true;
  }

  /**
   * True when everything the pass for this frame samples is exactly what this frame wants: stills
   * and loops have real pixels (a held loop its held frame), sequences show the very frame aimed at
   * rather than the nearest decoded one, and the pass's own extras have arrived. A missing asset
   * counts as settled (it will never arrive). The e2e hook waits on this before taking a frame.
   */
  settled(frame: FrameCtx): boolean {
    const bound = this.bySegment.get(frame.segment.id);
    if (!bound) return true;
    if (bound.def.settled && !bound.def.settled()) return false;
    const decls = bound.def.textures ?? [];
    for (let i = 0; i < decls.length; i++) {
      const decl = decls[i];
      const h = bound.handles[i];
      if (h.failed) continue;
      if (h.kind === "frames") {
        // Pinned (the e2e hook): a sequence keeps its frame on purpose.
        if (this.textures.pinned) continue;
        if (!h.showing(decl.frame ? decl.frame(frame, h.count) : frame.t * (h.count - 1))) return false;
      } else if (h.kind === "loop") {
        if (!h.settled) return false;
      } else if (!h.ready) {
        return false;
      }
    }
    return true;
  }

  /**
   * The e2e hook: whether drawing this frame would put a different frame of any sequence on screen
   * than the one there now (the pop test then also draws it with the sequences pinned).
   */
  sequencesMove(frame: FrameCtx): boolean {
    const bound = this.bySegment.get(frame.segment.id);
    if (!bound) return false;
    const decls = bound.def.textures ?? [];
    for (let i = 0; i < decls.length; i++) {
      const h = bound.handles[i];
      if (h.kind !== "frames" || h.failed) continue;
      const aim = decls[i].frame;
      if (!h.showing(aim ? aim(frame, h.count) : frame.t * (h.count - 1))) return true;
    }
    return false;
  }

  private drawWith(bound: BoundPass, program: Program, frame: FrameCtx): void {
    const { gl } = this.ctx;
    program.use();
    const u = program.uniforms;

    // Shared uniforms (the registry skips values that did not change).
    u.set2f("uRes", frame.res[0], frame.res[1]);
    u.set1f("uDpr", frame.dpr);
    u.set1f("uTime", frame.time);
    u.set1f("uP", frame.p);
    u.set1f("uT", frame.t);
    u.set1f("uVel", frame.vel);
    u.set2f("uMouse", frame.mouse[0], frame.mouse[1]);
    u.set1f("uStill", frame.still);
    u.set1f("uKick", frame.kick);
    u.set1i("uOctaves", frame.octaves);
    u.set1f("uBand", frame.band);
    u.set3f("uPage", frame.page[0], frame.page[1], frame.page[2]);
    for (const token of COLOR_TOKENS) {
      const c = this.colors[token];
      u.set3f(uniformNameFor(token), c[0], c[1], c[2]);
    }

    // Textures: bind in declaration order; sequences aim and take the nearest decoded frame.
    const decls = bound.def.textures ?? [];
    for (let i = 0; i < decls.length; i++) {
      const decl = decls[i];
      const h = bound.handles[i];
      if (h.kind === "frames") {
        const want = decl.frame ? decl.frame(frame, h.count) : frame.t * (h.count - 1);
        h.aim(want);
        h.near(want);
      }
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, h.texture);
      u.set1i(decl.uniform, i);
      u.set2f(`${decl.uniform}Size`, h.size[0], h.size[1]);
    }

    bound.def.uniforms?.(frame, u, this.textures);

    this.triangle.bind();
    this.triangle.draw();
  }

  /** How many of the textures the pass for a segment declares have real pixels (for the HUD). */
  ready(segment: Segment): { ready: number; total: number } {
    const handles = this.bySegment.get(segment.id)?.handles ?? [];
    let ready = 0;
    for (const h of handles) if (h.ready) ready++;
    return { ready, total: handles.length };
  }

  /** Whether the active pass wants a redraw every frame (breath). */
  breathes(segment: Segment): boolean {
    const bound = this.bySegment.get(segment.id);
    return bound ? bound.def.breathes !== false : false;
  }

  destroy(): void {
    for (const p of this.passes) {
      p.program?.destroy();
      p.probe?.destroy();
    }
    this.triangle.destroy();
  }
}

function kindOf(id: ArtId): "loop" | "still" | "frames" {
  return art[id].kind;
}
