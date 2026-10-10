/**
 * A worker thread for `npm run art:placeholders`: renders the plates it is sent (by id) and posts
 * back their WebP buffers. The manifest comes with the worker's data.
 */

import { parentPort, workerData } from "node:worker_threads";

import { renderPlate } from "./plates.mjs";

const { manifest } = workerData;

parentPort.on("message", async ({ id }) => {
  const entry = manifest.plates.find((p) => p.id === id);
  const t0 = performance.now();
  try {
    const buffer = await renderPlate(entry, manifest);
    parentPort.postMessage({ id, buffer, ms: performance.now() - t0 });
  } catch (error) {
    parentPort.postMessage({ id, error: error.stack ?? String(error) });
  }
});
