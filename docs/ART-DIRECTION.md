# Art direction

How the paintings of orange.io should look. `docs/STORYBOARD.md` says what happens, `docs/ART-PLATES.md` lists the plates and how they are made, `docs/ART-BRIEFS.md` (generated) holds a ready-to-use brief for every character plate. The cast lives as data in `scripts/art/cast.mjs`, so the briefs and the stand-in painter describe the same people.

## The target

An **academic neoclassical oil painting**, in the spirit of the salon painting of 1860 to 1900, at high finish. Code cannot paint that from scratch: the final figures come from an artist or an image-generation model, briefed from this page. Until they exist, a procedural stand-in (`scripts/art/`) paints every character as a small oil study in the same light, so the story reads as painted at every step.

## Style bible

- **Medium.** Oil on canvas, high finish. Smooth, blended transitions in the skin and drapery; a visible but fine canvas weave and a faint network of craquelure over everything, the sky included. Not cartoon, not a 3D render, not vector, not photographic.
- **Figures.** Realistic anatomy, especially hands, necks and wrists. Calm, idealised faces in profile or three-quarter view, eyes downcast or lifted. Warm blush on cheeks, nose, ears and knuckles; cool grey half-tones; soft lost-and-found edges; no black outlines. Adults are about 7.5 heads tall.
- **Cloth.** Heavy wool and velvet mantles with deep, weighty folds and a soft sheen; light linen with fine pleats, crisp creases and translucent thin edges; embroidered or gold-leaf trim; metal with warm specular glints. Folds hang from points of tension: shoulders, a belt, a knee, a hand.
- **Light.** One light for the whole story (below).
- **Ground.** Figures are painted against a flat, saturated cobalt sky with painted mottling and canvas tooth, or a pale stone-cream paper ground. For the plates, each painting is isolated on a plain flat key colour so it can be cut out (magenta `#ff00ff`, or cyan `#00ffff` where skin, red or terracotta dominate); no ground shadow.
- **Graphic layer on top of the painting** (drawn by the stage, never painted in): halftone-dot clouds, water and ripple rings; hairlines and mono labels. Paint clouds and water as soft luminance; the stage turns them into dots.
- **The canvas** (drawn by the stage over the stand-ins and the sky, never over a finished painting): a fine weave and paint tooth, a faint craquelure.

## One light

| | Direction | Colour | In the paint |
| --- | --- | --- | --- |
| Key | Warm sun from the upper left (toward the light: x -0.56, y -0.64 up, z 0.53) | Warm cream | Light and half-tone on every form's upper left |
| Fill | The blue sky on the shadow side | Cool sky blue | Shadows lean blue on cloth and stone; skin turns red ochre in shadow |
| Rim | A thin warm edge on the right of every form | Warm gold | One hairline of light on the right contour |

Every form shows five values: **light, half-tone, core shadow** (the darkest band at the turn), **reflected light** (lifted by the fill near the shadow edge) and **cast shadow** (an arm on a robe, a hat brim on a face). Marble takes warm, translucent light in its thin edges; metal takes small warm glints and a little sky.

## Palette

Milk linen, saffron ochre, terracotta, indigo and slate blue, olive, sand, leather; the story's orange (`#FF7A00`) is the single warm accent. Never dark-green velvet, a red sash, a laurel wreath or a brass watering can. The interface keeps to the tokens of `DESIGN.md`; these pigments are the paintings' own (`PIGMENTS` in `scripts/art/cast.mjs`).

## The cast

Original designs for this story. What makes each one recognisable, scene to scene:

| Character | Plates | Recognise them by |
| --- | --- | --- |
| The statue | `hero/statue`, `hero/statue-orange` | Carved marble, never flesh; warm ivory stone, grey veining; a peplos with an overfold and gold-leaf hems; hair in a low knot tied with a ribbon; one arm raised high on the right of the picture, the orange (with a gilded leaf) in her hand, her head tipped back toward it |
| The onlookers | `hero/crowd-far`, `crowd-mid`, `crowd-near` | Eleven distinct townspeople of every age and skin tone: an elder with a silver beard, women in veils, a boy, a man in a straw hat, a capped man, a girl in a saffron cap; ochre, terracotta, indigo, slate, olive, milk linen; every face tipped up toward the statue |
| The grafting hands | `graft/hand-left`, `graft/hand-right` | Weathered, sun-browned hands in rolled milk-linen cuffs: one pinches the cut stem, one binds it with buff twine |
| The harvester | `pluck/hand`, `pluck/harvester-body`, `-arm`, `-head`, `share/arm-open`, `share/knife-hand` | A young man: tousled chestnut hair under a plain linen headband, an ivory tunic to the knee, a saffron-ochre mantle over his left shoulder, bare forearms; the orange in his right hand, his eyes on it; a bone-handled fruit knife in his left |
| The second hand | `share/second-hand` | A woman's slender hand, palm up, a thin silver ring, a rolled linen cuff |
| The builder | `work/builder`, `blueprint/builder`, `site/builder-left`, `-right`, `-seated` | One stocky man in his thirties, the same in every plate: short black beard, cropped black hair, a rust-brown tunic, a leather apron and tool belt; mallet and chisel, or the plan on his knees |
| The architect | `blueprint/architect` | A woman in her fifties: an ivory linen veil and open robe over an indigo underdress; her hands held as if around a folded sheet |
| The gardener | `prune/gardener`, `-arms-1`, `-arms-2` | An older man: a wide straw hat with an olive band, a dark beard streaked with silver, an olive apron over a sand tunic; long-bladed shears |
| The astronomer | `stars/astronomer` | A lean man with dark curls in a deep indigo wool cloak; one arm raised, index finger pointing, the fingertip clear against the sky |
| The orchard keepers | `finale/woman-body`, `-arm`, `man-body`, `-arms-1`, `-arms-2` | She: an ivory peplos, a saffron-orange sash, black hair braided and coiled low, pouring from a terracotta jug. He: a slate-blue mantle over an ivory tunic, short auburn curls, bare head, long-bladed shears in both hands |

The world in the same light: the orange tree (bark, leaves with a lit side and a vein, fruit with a core shadow and a pitted rind), the urn, the plinth and the fluted column, the stone courses of the tower.

## Placing figures

Plates of one figure (a body, its arm, its head) are cut from one pose and must meet exactly where the manifest places them, so the briefs give each plate's framing, anchor and size. The places the story ties things to are named points on the plates (`points` in the manifest): the orange in the harvester's hand, the astronomer's fingertip, the blade tip, the jug's spout, the tips of the shears, the plan between the architect's hands, the oranges in the orchard. A painting brings its own points in its sidecar; nothing in code assumes where a hand is.

Two plates the stand-in had to bend: the harvester's head plate is placed for a head a little smaller than his body's 7.5-head proportion (paint him close to 8 heads tall, his head bowed), and the architect's sheet is its own plates, so her painting shows her hands around it, not the sheet.

## Originality

- Every figure, face, costume, pose and composition is an original design for this story. The cast sheet deliberately differs from any reference.
- Never copy, trace, recreate or imitate a figure, composition, costume or image from another site or painting, and never attach one as a reference to a generator. Attach only this story's own reference sheets.
- No reference screenshots in the repository. `docs/REFERENCE.md` records pacing and technique only.
- Use only paintings you have the rights to (commissioned, generated under terms that grant them, or your own).

## The stand-in

Until the paintings exist, `npm run art:placeholders` paints each character plate as a small oil study (`scripts/art/`): figures built from tapered limbs, turned heads, grouped fingers and hanging drapery; lit by the light above with cast shadows; painted with thousands of seeded, translucent, bristled strokes along the folds, the limbs and around the forms; finished with impasto catch-lights, canvas weave, a faint craquelure and a broken edge. Props get a lighter pass in the same light. It is a stand-in: it shows composition, colour and light, not the finish this page asks of the paintings.
