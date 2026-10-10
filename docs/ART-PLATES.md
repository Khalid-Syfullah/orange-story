# Art plates

Every scene is built as a 2.5D stack of painted layers (plates) in React Three Fiber: flat images with transparency, set at different depths so the camera can push, pan and dolly through them. Until real art exists, each plate is a generated placeholder (simple silhouettes and color fields) loaded from the same path, so swapping in final art needs no code changes.

All plates live in `public/art/<scene>/<plate>.webp` (with alpha), listed in `public/art/manifest.json` with size, depth and anchor points. Paint or generate them in one consistent style: classical oil-painting look, warm sunlight, deep blue sky, crisp silhouettes, figures in robes. Keep characters, faces and outfits consistent across scenes. Use only original artwork you have the rights to.

| Scene | Plates |
| --- | --- |
| hero | sky gradient; glow droplet sprite; statue holding an orange aloft (cut-out, orange as a separate layer); minaret shaft (tileable); crowd of robed onlookers looking up (2 to 3 depth layers) |
| ascent | minaret-to-trunk transition (stone texture, bark texture, a mask texture for the morph); branch layers; leaf sprites |
| graft | branch close-up; left hand; right hand; cutting; twine wrap; knot (each as separate layers for animation) |
| pluck | foliage layers with oranges (3 depths); single hero orange; rising hand; harvester in white robe (body, right arm with orange, head) |
| share | knife hand; orange halves (outer peel and cut face separate); second person's hand |
| work | cloud sprites (4 to 6, halftone treatment); giant orange on minaret; builder |
| blueprint | scaffold and minaret; builder; architect; plan in 4 fold panels |
| site | seaside ground and sea; marble platform; timber stage and steps; orange under construction; three builders; matching top-down plate of the same set; tiled ground pattern; blurred leaf-shadow texture |
| prune | marble column and urn; young orange tree (branches as separate layers so one can fall); gardener |
| fall | falling orange; two rows of orange trees left and right (2 depths each); rainbow ring mask |
| faq | orchard plates reused; sparkle sprite |
| stars | fabric sky texture; billowing cloud; marble platform and stairs; astronomer with raised arm; star sprite |
| finale | tree; woman with watering can (body, arm, water stream frames); man with shears (body, arms frames); falling orange sprite; cloud sprites |

## Manifest, placeholders and final art

- `public/art/manifest.json` lists every plate: its file (`src`), pixel `size`, `depth` (distance behind the picture plane in world units, z = -depth), `anchor` (the image point, as fractions from the left and top, placed at `position`), world `height`, and the `scenes` that use it (the first one owns the folder). Optional fields: `role` (`plate`, `backdrop`, `texture`, `sprite`), `rotation`, `layer`, `tile` and `repeat` for tileable images, `linear` for masks, a default `sway` in degrees, and `frame` for animation frames.
- `npm run art:placeholders` draws a placeholder for every entry that still has a `placeholder` spec (flat palette colors and simple silhouettes). `npm run art:placeholders -- --check` verifies that every entry has a WebP file of the listed size.
- To add final art: save the painting as WebP with alpha at the entry's path and size (or update `size`), then delete the entry's `placeholder` spec so the generator never overwrites it. No code changes; the unit test (`npm test`) checks every file against the manifest.
- Textures are capped at 2048 px on the longest side (1024 on low-memory and small touch devices) and loaded only for the scene on stage and the next one.
- The transition canvas also reads three plates, a few screens before it needs them: `fall/ring-mask` (the rainbow ring's band: a radial image, black inside and outside, bright where the ring is; its radius is the mask's edge), `stars/fabric-sky` (the cloth the sky turns into) and `stars/cloud` (the cloud that billows over to fill the screen). Until they load, the shaders draw stand-ins.
