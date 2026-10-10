import { describe, expect, it } from "vitest";

import { rippleGeometry } from "./glow-ripple";
import { UNIT_PLANE } from "./plate";

describe("the glow ripple's geometry", () => {
  it("owns its buffers: disposing it (when the hero unmounts) never touches the plates' shared quad", () => {
    const geometry = rippleGeometry("test", 12, 0.3, [1, 2], 7);
    expect(geometry.getIndex()).not.toBe(UNIT_PLANE.getIndex());
    for (const name of ["position", "normal", "uv"]) {
      expect(geometry.getAttribute(name)).toBeDefined();
      expect(geometry.getAttribute(name)).not.toBe(UNIT_PLANE.getAttribute(name));
    }
    // Disposing it leaves the shared quad's attributes as they were.
    const position = UNIT_PLANE.getAttribute("position");
    geometry.dispose();
    expect(UNIT_PLANE.getAttribute("position")).toBe(position);
  });

  it("repeats one quad per droplet, bounded by its reach around the source", () => {
    const geometry = rippleGeometry("test", 12, 0.3, [1, 2], 7);
    expect(geometry.instanceCount).toBe(12);
    expect(geometry.getAttribute("drop").count).toBe(12);
    expect(geometry.boundingSphere?.radius).toBe(7);
    expect(geometry.boundingSphere?.center.toArray()).toEqual([1, 2, 0]);
  });
});
