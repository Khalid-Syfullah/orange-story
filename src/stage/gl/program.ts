// Program builder, uniform registry and the single full-screen triangle.
//
// Every fragment shader gets the same header (extension, precision) and the GLSL library
// (lib.glsl.ts) prepended. Compile and link errors are reported to the console with the offending
// lines of source, and the builder returns null so the pass manager can fall back to a flat fill
// instead of drawing garbage.
import type { GLContext } from "./context";
import { LIB_GLSL, VERTEX_GLSL } from "./lib.glsl";

/** Sets uniforms by name, skipping GL calls when the value has not changed. */
export interface UniformSetter {
  has(name: string): boolean;
  set1f(name: string, x: number): void;
  set2f(name: string, x: number, y: number): void;
  set3f(name: string, x: number, y: number, z: number): void;
  set4f(name: string, x: number, y: number, z: number, w: number): void;
  set1i(name: string, x: number): void;
}

export interface Program {
  readonly name: string;
  readonly program: WebGLProgram;
  readonly uniforms: UniformSetter;
  use(): void;
  destroy(): void;
}

interface UniformSlot {
  location: WebGLUniformLocation;
  type: number;
  /** Last value sent, so a redundant set is skipped. NaN means never set. */
  cache: Float64Array;
}

class UniformRegistry implements UniformSetter {
  private readonly slots = new Map<string, UniformSlot>();

  constructor(
    private readonly gl: WebGLRenderingContext,
    program: WebGLProgram,
  ) {
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, "");
      const location = gl.getUniformLocation(program, info.name);
      if (!location) continue;
      const cache = new Float64Array(4);
      cache.fill(Number.NaN);
      this.slots.set(name, { location, type: info.type, cache });
    }
  }

  has(name: string): boolean {
    return this.slots.has(name);
  }

  /** Names of every active uniform (for the HUD and for checks). */
  names(): string[] {
    return [...this.slots.keys()];
  }

  set1f(name: string, x: number): void {
    const s = this.slots.get(name);
    if (!s || s.cache[0] === x) return;
    s.cache[0] = x;
    this.gl.uniform1f(s.location, x);
  }

  set2f(name: string, x: number, y: number): void {
    const s = this.slots.get(name);
    if (!s || (s.cache[0] === x && s.cache[1] === y)) return;
    s.cache[0] = x;
    s.cache[1] = y;
    this.gl.uniform2f(s.location, x, y);
  }

  set3f(name: string, x: number, y: number, z: number): void {
    const s = this.slots.get(name);
    if (!s || (s.cache[0] === x && s.cache[1] === y && s.cache[2] === z)) return;
    s.cache[0] = x;
    s.cache[1] = y;
    s.cache[2] = z;
    this.gl.uniform3f(s.location, x, y, z);
  }

  set4f(name: string, x: number, y: number, z: number, w: number): void {
    const s = this.slots.get(name);
    if (!s || (s.cache[0] === x && s.cache[1] === y && s.cache[2] === z && s.cache[3] === w)) return;
    s.cache[0] = x;
    s.cache[1] = y;
    s.cache[2] = z;
    s.cache[3] = w;
    this.gl.uniform4f(s.location, x, y, z, w);
  }

  set1i(name: string, x: number): void {
    const s = this.slots.get(name);
    if (!s || s.cache[0] === x) return;
    s.cache[0] = x;
    this.gl.uniform1i(s.location, x);
  }
}

/** The header every fragment shader starts with. */
function fragmentHeader(derivatives: boolean): string {
  return [
    derivatives ? "#extension GL_OES_standard_derivatives : enable" : "",
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    derivatives ? "#define HAS_DERIVATIVES 1" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build the full fragment source: header, library, then the pass (as source string 1 for #line). */
export function assembleFragment(passSource: string, derivatives: boolean): string {
  return `${fragmentHeader(derivatives)}\n${LIB_GLSL}\n#line 1 1\n${passSource}\n`;
}

function numbered(src: string): string {
  return src
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}  ${line}`)
    .join("\n");
}

/** Print a compile log next to the lines it points at. The log uses `ERROR: <string>:<line>:`. */
function reportShaderError(name: string, stage: string, log: string, source: string, passSource: string): void {
  const lines: string[] = [`[stage] ${stage} shader "${name}" failed to compile:`, log.trim()];
  const re = /ERROR:\s*(\d+):(\d+)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(log)) !== null) {
    const str = Number(m[1]);
    const line = Number(m[2]);
    const key = `${str}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // String 1 is the pass source (after the #line directive); string 0 is header + library.
    const src = str === 1 ? passSource.split("\n") : source.split("\n");
    const from = Math.max(0, line - 3);
    const to = Math.min(src.length, line + 2);
    const excerpt = src
      .slice(from, to)
      .map((l, i) => `${from + i + 1 === line ? ">" : " "} ${String(from + i + 1).padStart(4, " ")}  ${l}`)
      .join("\n");
    lines.push(`--- ${str === 1 ? "pass" : "library"} around line ${line} ---\n${excerpt}`);
  }
  console.error(lines.join("\n"));
  if (process.env.NODE_ENV !== "production") {
    console.groupCollapsed(`[stage] full source of "${name}"`);
    console.log(numbered(source));
    console.groupEnd();
  }
}

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
  name: string,
  stage: string,
  passSource: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    reportShaderError(name, stage, gl.getShaderInfoLog(shader) ?? "", source, passSource);
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Compile and link a pass. `fragment` is the pass's own source: the header and the library are
 * prepended here. Returns null (after reporting) when anything fails.
 */
export function buildProgram(ctx: GLContext, name: string, fragment: string): Program | null {
  const { gl } = ctx;
  const fragSource = assembleFragment(fragment, ctx.derivatives);
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_GLSL, name, "vertex", VERTEX_GLSL);
  if (!vs) return null;
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource, name, "fragment", fragment);
  if (!fs) {
    gl.deleteShader(vs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.error(`[stage] program "${name}" failed to link:\n${gl.getProgramInfoLog(program) ?? ""}`);
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = new UniformRegistry(gl, program);
  return {
    name,
    program,
    uniforms,
    use() {
      gl.useProgram(program);
    },
    destroy() {
      gl.deleteProgram(program);
    },
  };
}

export interface Triangle {
  /** Bind the vertex buffer and attribute (once per frame is plenty). */
  bind(): void;
  /** Draw the single full-screen triangle. */
  draw(): void;
  destroy(): void;
}

/** One triangle that covers the clip space: (-1,-1), (3,-1), (-1,3). No quad seam, one draw call. */
export function createTriangle(ctx: GLContext): Triangle {
  const { gl } = ctx;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return {
    bind() {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    },
    draw() {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteBuffer(buffer);
    },
  };
}
