/**
 * A worker thread for `npm run art:placeholders`: renders the plates it is sent (by id) and posts
 * back their WebP buffers, and the rig a character's stand-in gives its plate. The manifest comes
 * with the worker's data. With `rigOnly`, it builds the figure and posts the rig without painting.
 */

import { parentPort, workerData } from "node:worker_threads";

import { plateRig, renderPlate } from "./plates.mjs";

const { manifest } = workerData;

parentPort.on("message", async ({ id, rigOnly = false }) => {
  const entry = manifest.plates.find((p) => p.id === id);
  const t0 = performance.now();
  try {
    const rig = plateRig(entry, manifest);
    const buffer = rigOnly ? null : await renderPlate(entry, manifest);
    parentPort.postMessage({ id, buffer, rig, ms: performance.now() - t0 });
  } catch (error) {
    parentPort.postMessage({ id, error: error.stack ?? String(error) });
  }
});
