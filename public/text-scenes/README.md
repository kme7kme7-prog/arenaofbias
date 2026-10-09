# Entertainment reading illustrations

## Paper objects · 2026-10-08

- `paper-fibers.svg`: code-drawn 80px repeat tile, sparse fine fibers and points. No raster generation, animation or SVG filter. Used only on entertainment paper surfaces.
- `cinema-stairs.svg`: code-drawn faint stair/window motif in the cinema lens, no wording or answer content.
- Flower postage, cancellation waves and margin sprigs/envelopes/books are inline SVG in `components/text-stage.tsx`. They are decorative and hidden from accessibility navigation. The existing generated forest and bench illustrations are retained.
- These static decorations are outside the work-ready gates and do not change stored artwork. Native forest text reuses the existing self-hosted WenKai font; isolated legacy HTML keeps its original typography.

## Third revision · 2026-10-08

`forest-line-v3.png` replaces v2 in the pale-sage forest scene: leafy trees, readable red hood, true transparent alpha. Generated with the built-in image tool, original file preserved; v2 retained for comparison. Waiting artwork unchanged.

Prompt:

Use case: illustration-story. Make a genuinely transparent background minimalist literary book illustration, wide 2:1 composition, for a pale sage green reading website. Little Red Riding Hood as a small but readable figure in a muted brick red cloak with a basket, walking along a simple curving path. Two friendly leafy woodland trees frame the scene loosely, their rounded airy foliage drawn with just a few organic contour strokes. Dark muted sage green linework, spare confident hand-drawn pen strokes, one small flat muted red accent on the hood. Warm, quiet storybook mood, natural proportions, clearly readable at 300px wide. No dead bare branches, no spooky mood, no realistic detail, no hatching, no texture, no shadows, no lettering, no borders, no rectangle or ground fill. True transparent alpha in all empty areas. Few strokes, lots of breathing space, all elements fully within frame.

Created 2026-10-08 using the built-in image generation tool (not the API/CLI).
The selected second versions retain their generated transparent alpha; no work content was modified.

- `forest-line-v2.png`: Little Red Riding Hood, used only in the entertainment forest masthead.
- `waiting-line-v2.png`: empty bench, used only in the entertainment waiting masthead.

Both assets have fixed layout dimensions and decode asynchronously. They do not participate in work-ready gates.

## Prompt set

### forest-art

Use case: illustration-story. Create a refined minimalist pen-line illustration for the top-right ornament of a literary reading website: Little Red Riding Hood seen from behind, a tiny red hooded figure walking on a gently winding path between a few elegant tall woodland trees. Wide composition about 2:1, sparse and airy, handmade editorial book illustration, very few confident organic strokes, sophisticated rather than childish clip art. Muted warm ivory and sage-green linework with one restrained rusty red hood, designed to read on a deep forest green (#1f3830) webpage. Transparent background with genuine alpha throughout all empty areas; no solid backdrop, no paper rectangle, no scenery wash, no shadows outside the drawn objects. No text, lettering, watermark, border, frame or UI. Keep ample breathing space around every edge, all tree tops and figure fully inside the composition.

### waiting-art

Use case: illustration-story. Create an exquisite understated minimalist pen-line drawing of a single empty wooden waiting bench viewed from a gentle three-quarter angle. Sparse organic hand-drawn strokes, a few parallel slats and slender legs, quietly evocative editorial book illustration. Wide composition about 2:1; bench occupies most of the width, fully visible, plenty of air around it. Muted deep sage/graphite linework (#52665b), a tiny amount of warm pale wood color, restrained and calm, designed as a small ornament on a pale gray-green literary reading webpage. Transparent background with genuine alpha in all empty areas. No floor slab, background wash, rectangle, room, people, text, letters, watermark, border or frame. Avoid geometric clip art and heavy cartoon outlines.

### forest-art-v2

Simplify this exact composition radically into an elegant truly MINIMAL LINE DRAWING, intended to display only 300 pixels wide. Keep a tiny walking red-hooded girl, two or three trees, and a suggestion of a path. Remove all foliage, all shading, all bark texture, all grass, all rocks, all hatching, all painted areas except the girl's small muted red cape. Trees should be just a few gently imperfect organic ivory/sage contour lines; path only two curves. A literary marginalia drawing with perhaps 25 strokes total and huge transparent empty areas. Fine, confident, natural hand-drawn lines. The background MUST remain actually transparent, no rectangle or colored backdrop. No text. Retain a wide composition and all objects fully framed. Pale ivory/sage lines must show on dark forest-green UI.

### waiting-art-v2

Reduce this bench radically to an elegant minimalist hand-drawn contour sketch for a literary website, shown only 200 pixels wide. Just one empty modest wood bench at this gentle three-quarter angle, THREE back slats, seat and slender legs. Remove ALL woodgrain, pencil shading, color fills, ornamental detailing, bolts, shadows, crosshatching. Use only a few confident muted deep sage (#52665b) organic pen lines, delicate and slightly imperfect, with large empty gaps, sophisticated airy book marginalia. Maintain real transparent alpha background, including inside all bench openings. No setting, floor, paper rectangle, text, frame or watermark. Wide 2:1 composition. All parts fully in frame.
