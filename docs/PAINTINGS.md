# Paintings

Every painting shares one style preamble so the sections cut together as one hand. Prepend it to every image prompt. Sizes are the generation targets; the import script (`npm run art:import`) makes the tiers.

Assets live in `art/source/<id>.<png|mp4>` (gitignored, large) and are imported to `public/art/<id>/` by `scripts/art-import.mjs`: stills become `1440.jpg` and `768.jpg`; videos become frame sequences `1440/f_000.jpg …` and `768/…` plus `manifest.json` (`{"tiers":{"1440":{"count":N},"768":{"count":N}}}`). Loops stay as mp4 (`public/art/<id>.mp4`) with a poster. When a source is missing, the import writes a painted placeholder (silhouettes and colour fields in the right palette) at the same paths so nothing in the build depends on art being present.

```text
STYLE PREAMBLE (prepend to every painting prompt)
Neoclassical academic oil painting in the manner of a 19th-century salon painter: smooth modelling, fine visible brushwork, warm skin, cream and ochre drapery, white Carrara marble, one deep cobalt-blue sky with no gradient banding. Light from the upper left, long soft shadows. Museum finish, no frame, no text, no watermark, no signature. Subject colours: orange peel in saturated orange-gold with burnished highlights and visible dimples, glossy dark-green leaves.
```

| id | Kind | Size | Used in |
| --- | --- | --- | --- |
| `hero` | video loop 10 s (or still) | 16:9, 2048x1152 | Hero |
| `bridge` | 121 frames | 16:9 | Hero → Model |
| `graft` | still or 5 s video | 16:9 | Model beat 1 (no copy) |
| `grove` | still or 5 s video | 16:9 | Model beats 2 and 3: the canopy (We build it.), then the camera drops to the picking hand (We rank it.) |
| `share` | three keyframes or an 8 s video | 16:9 | Model beat 4 (We share in what it earns.); last frame = the halves held apart |
| `plate` | still | 9:16, 1152x2048 | The Work, the push into the parchment |
| `drawing` | 121 frames | 1:1 | The Terms (window) |
| `plan` | still | 1:1, 1536x1536 | Last frame of `drawing` |
| `coda` | 89 frames | 16:9 | The Terms (blue) |
| `share-orange` | still | 1:1 | Last frame of `coda` |
| `canopy` | video loop 10 s | 16:9 | Questions |
| `application` | still | 16:9 | Application |
| `sapling` | still | 16:9 | The rise |
| `finale` | video loop 10 s | 16:9 | Finale |

## hero

```text
A monumental ripe orange as tall as a house rests on a stepped white marble plinth on the right half of the canvas, short woody stem and two glossy leaves on top. Three women in Greek drapery attend it: lower left, one in a cream gown with a rust-red sash tilts an empty brass watering can toward the steps; centre, one in a cream tunic with a golden-ochre sash stands on the steps polishing the peel with a white cloth; far right, one in an ochre shawl stands with a hand on her chest. The whole upper left is clear cobalt sky with no clouds. Subjects grouped lower right so the upper left stays open for copy.
MOTION (10 s loop): the cloth moves slowly over the peel; the can tilts a little; drapery stirs; the camera holds. Keep the sky around the orange's crown clear: the shader draws faint concentric rings of tiny dots rippling outward from it like a signal, and a small rainbow glint near the headline.
```

## bridge

```text
First frame = the hero's last frame. Last frame = graft's first frame.
MOTION (image-to-video with both keyframes, 8 s): the scene transforms in place; nothing cuts. The camera tilts up from the steps to a low upward angle. The white marble plinth turns to gnarled orange-tree bark from the bottom up along a torn, irregular edge, while the plinth's top slab, the part the orange rests on, stays exactly where it is until the bark reaches it; the slab then lifts away like a cap, turning slowly as it goes, and leaves the trunk's cut top. The orange stays where it is for the first part of the move and becomes fruit hanging from a branch the trunk puts out; the tilt then carries it out of the bottom of the frame. Leaves sprout along new branches. The three attendants and the cobalt sky fade out together as the ground goes paper-white. A grafting knife with a boxwood handle falls past the lens, tumbling, then lies on the bough; a coil of raffia drifts down beside it. The orange's screen position and size at the first frame are identical to the hero's last frame.
```

## graft

```text
Close on two hands grafting a citrus scion onto a cut branch: the left hand steadies the branch, the right hand, in a dark-blue velvet cuff with gold embroidery, winds pale raffia twine around the join; a small grafting knife with a boxwood handle lies on the bough below; four young orange leaves and a white blossom bud sprout from the scion. Background a flat warm paper-white, no sky, no horizon (the cobalt of the bridge has just gone). The hands fill the lower two thirds; the scion rises into empty space above.
MOTION (5 s): the knife settles on the bough, the right hand completes one slow wrap of the twine and ties it off; the leaves barely stir; then the camera pushes forward through the scion's leaves, which sweep across the lens (this push-through lands in the grove). Otherwise the camera is static.
```

## grove

```text
Looking up into a dense orange tree heavy with fruit against a pale overcast-white sky: dozens of oranges among dark glossy leaves across the whole frame, one gilded orange low and a little right of centre, brighter than the rest. From the lower right a single hand in a white lace cuff and green velvet sleeve reaches up and closes around the gilded orange. Branches frame the edges; no ground visible. The upper half of the frame is canopy only (leaves and fruit, no hand), because the first beat's copy sits over it.
MOTION (5 s): the camera first holds on the upper canopy (fruit and leaves stirring), then drops down the tree; the hand rises from below the frame and takes the gilded orange; the branch dips slightly under the pull. The gilded orange ends where `share` holds it in its first keyframe, at the same screen position and size. Optional, painted small into the lower-right corner of the still: the top of an auburn-curled head and a green velvet shoulder entering as the camera finishes dropping.
```

## share

```text
A young man with auburn curls in a dark-green velvet doublet with gold-embroidered collar and white lace cuffs, three-quarter profile facing left, holds a gilded orange at eye level in his right hand and studies it. Flat paper-white background. He sits right of centre; the left third is empty.
MIDDLE KEYFRAME: the same pose, a small knife with a boxwood handle in his left hand, the blade entering the peel at the orange's equator.
SECOND KEYFRAME: two hands, one his and one entering from the left in a plain cuff, hold the orange cut cleanly in half, the two halves tilted toward the viewer showing bright segments and a bead of juice, a hand's width apart. This frame is the one The Split opens.
MOTION (8 s): the orange turns a quarter in his fingers; the knife comes in and slices it; the second hand arrives from the left and takes one half; the halves are held a hand's width apart.
```

## plate

```text
Portrait 9:16, taller than any viewport. Top third: clear cobalt sky, nothing in it (clouds are added in the shader). Middle: the same monumental orange from the hero, now wrapped in a timber scaffold of lashed poles, planks and rope ladders; a man in a white tunic with a red sash stands on a plank at the orange's shoulder polishing the peel with a cloth, his back to us; a coil of rope and a bucket on the plank. Lower third: the white marble plinth, and on a lower scaffold stage a woman in a white gown with a red sash holds open a large parchment blueprint showing the orange's plan in ink lines, reading it. Scaffold poles run off the right edge. Keep the left 35% of the middle and lower thirds quiet (sky and plain marble) for copy.
```

## drawing and plan

```text
DRAWING (121 frames, square): the plate's scene as an architect's ink-and-watercolour construction drawing on cream paper: sepia line work, thin washes of ochre on the orange, grey-blue on the sky, the scaffold as measured timber with a ladder and a hoist, a labourer on the stage, a mosaic floor with a meander border round the plinth, pencil construction lines and dimension ticks left showing. Loose, confident, unfinished at the edges.
MOTION: one continuous orbit from eye level up and over to directly above, the drawing redrawing itself as the view changes (lines wobble, washes re-pool). First frame: eye-level three-quarter view. Last frame: PLAN.

PLAN (square 1:1, 1536x1536, generate first and use as the orbit's end keyframe): a top-down architectural plan of the colossus: the orange seen from directly above as a dimpled gold disc with its stem and two leaves, centred on the square marble plinth, inside a ring of timber scaffolding drawn as a measured square frame with four corner towers, a hoist, two tiny workers and a ladder, the mosaic floor's meander border round the outside. Ink line work in sepia with light watercolour: ochre on the fruit, cool grey on the marble, raw umber on the timber. Pencil grid, a north arrow, dimension ticks, a worn fold crease. Aged cream paper fills the square; the drawing occupies the middle 70%.
```

## coda and share-orange

```text
CODA (89 frames, 16:9): against a flat deep-blue backdrop, a woman in a white gown with a crimson sash stands on the left of a white marble plinth, lifting a long gilded picking rod toward a small orange tree growing from a marble urn on the plinth; the tree carries eight oranges, three of them gilded. Soft studio light from the left; the blue backdrop has no horizon and no texture. The tree and plinth sit right of centre; the left third is open blue.
MOTION: the rod touches one gilded orange, it detaches and floats down slowly to hang in mid-air left of the tree; the camera pushes in and drifts right so the woman and the tree leave the frame on the right; a few leaves scatter as the fruit comes free. Last frame: SHARE-ORANGE.

SHARE-ORANGE (square, generate first and use as the coda's end keyframe): one gilded orange with a short stem and one leaf, floating at the centre of a flat cobalt field, lit from the upper left, casting no shadow. Nothing else in the frame. The halo and the blurred copy behind it are drawn in the shader.
```

## canopy

```text
Looking straight up through the branches of an orange tree: dark glossy leaves and a dozen oranges around all four edges, some lit from behind so the peel glows, framing an open patch of cobalt sky in the centre. No ground, no trunk, no clouds (the cloud is added in the shader). The branches must leave the centre 50% of the frame as clear sky.
MOTION (10 s loop): leaves stir in a light wind; one orange sways on its stem; the camera holds.
```

## application

```text
A woman in a white Greek gown with a crimson sash over one shoulder stands on the left on a flight of white marble steps, seen from behind at three-quarter, right arm raised and index finger pointing up into a cobalt sky that fills the right two thirds. Large soft cumulus clouds in the sky, brightest near her hand, thinning toward the top right. Dark curls tied up. A small gilded orange sits on the top step beside her. No stars (the constellation is drawn in SVG over the painting).
```

## sapling

```text
A young orange sapling with a slim trunk, a dozen leaves and three small green oranges, growing from bare marble at the bottom centre of a cobalt sky; nothing else. Painted small, leaving most of the frame as sky.
```

## finale

```text
A young orange tree with five gilded oranges at the centre of a cobalt sky. Left: a woman in a white gown with a red sash pours from a brass watering can at its roots (the can is empty; the pour is added in the shader). Right: a young man in dark-green drapery, auburn curls, bends to tie up a branch. Both figures cropped at the waist by the frame edges. Open sky above the tree for the wordmark.
MOTION (10 s loop): the can tilts a little further; the man's hands finish the knot; leaves stir; the camera holds.
```

## Video generation (Veo)

The loops and sequences are made from the stills by `scripts/art-video.mjs`, which calls Veo through the Gemini API. Run `node scripts/art-video.mjs` for a dry run that prints the clips and the cost; add `--only <id> --yes` to make one, `--yes` for all.

- **Model and price:** default `veo-3.1-fast-generate-preview` at 1080p, $0.12 per second of video, so six 8 s clips cost about $5.76 (Standard is about $19.20; prices are previews, check ai.google.dev/gemini-api/docs/pricing). You are charged only for clips that succeed.
- **Key:** `GEMINI_API_KEY` in the environment or in `.env.art` (copy `.env.art.example`). Veo has no free tier, so the Google project needs billing. Never paste the key into chat or commit it.
- **Keyframes:** each clip is image-to-video with a first and a last frame from the stills in `art/source/`: `hero`, `canopy` and `finale` use the same still for both so they loop; `bridge` runs from the last frame of `hero.mp4` (or `hero.png`) to `graft.png`; `drawing` from `drawing.png` to `plan.png`; `coda` from `coda.png` to `share-orange.png`.
- **Veo limits that differ from the table above:** clips are 4, 6 or 8 s, 16:9 or 9:16 only, and 1080p needs 8 s. So loops are 8 s, not 10 s, `bridge` is 8 s, and `drawing` is made inside a 16:9 frame (cream bars) and cropped to its centre square by the import (`art/source/drawing.json` carries `cropSquare`). The import samples the frame counts (121, 121, 89) evenly from each clip.
- **Audio:** Veo adds a soundtrack; the script strips it. Generated videos are kept by Google for 2 days, so the script downloads each one as soon as it finishes.
- **Seamless loops are not guaranteed.** If a loop jumps, regenerate that clip with `--only <id> --force`, or let the import crossfade the end into the start.
