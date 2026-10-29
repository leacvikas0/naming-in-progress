# Sunpetal Vale — art direction brief (post-processing + scene)

## The target

`game/handoff/map-bg/concepts/ref-lavender-meadow.png` — "Lavender Blossom Meadow by
the Lake". Look at it before doing anything. It is the look we are chasing:

- **Camera**: eye level, ~1.7 m, low horizon. The sky occupies the top ~35–40% of
  the frame. The path leads in from the bottom. Trees sit on a gentle rise.
- **Light**: bright, airy, high-key daylight. Sun from the upper right, soft and
  warm-white — **not** orange or yellow. Sky is a clean saturated blue with white
  clouds. Distant mountains are cool blue and hazy.
- **Colour**: luminous pastel. Vivid green grass, lavender flower clumps, pink
  petals. Saturation is high but never neon; shadows are cool blue-green, never
  black, never grey.
- **Air**: strong aerial perspective — distance desaturates and cools toward the
  sky colour. Nothing in the far field is as saturated as the near field.
- **Petals**: a few large, soft, out-of-focus petals close to the lens; crisp
  delicate petals around the trees; tiny pale flecks in the distance. They dance
  on curved paths, never explode or rain uniformly.
- **Bloom**: selective — the bright sky, flower clusters and petal edges glow;
  the greens do not.

## Current state (as of this brief)

The meadow background is in `game/src/map/` and is rendered by
`game/handoff/map-bg/preview.html`. It already has:

- terrain, path, lake, sky dome, ridges, clouds (`terrain.js`, `sky.js`)
- ported botanical grass/flowers + procedural flowering trees (`kit.js`,
  `port/anime-flower-tree.js`, `port/refb-kit.js`)
- a petal field with three depth layers (`petal-field.js`)
- a post chain with bloom + a grade pass (`post.js`), currently on by default

The scene is at ~1.0M triangles in the play view. That budget is a hard ceiling:
**do not exceed ~1.05M triangles** in the gameplay camera.

## What is wrong (honest)

1. The camera used to look down at the meadow from ~7.6 m; it now sits at eye
   level, but the framing is still not the reference: no low horizon, no sense of
   a rise, the trees are cropped at the top.
2. The post grade is generic: it neither creates the airy high-key light of the
   reference nor the lavender-blue air. It also risks a yellow cast.
3. The petals read as scattered confetti rather than a few dancing petals.
4. The scene lacks aerial perspective — distant trees are as saturated as near
   ones.
5. There are no contact shadows under the trees (they float).

## Rules

- Keep the stylized 3D anime identity. Do not turn the scene into a blurry
  painting, do not add film grain, chromatic aberration, or heavy DOF.
- No orange/yellow grade. Sun is warm-white; air is lavender-blue.
- Keep it performant: 60 fps at 1400×900 on a mid GPU; ≤ ~1.05M tris; post chain
  is one composer with bloom + one grade pass.
- Work only in these files (write scopes):
  - `game/src/map/post.js`
  - `game/src/map/palette.js`
  - `game/src/map/index.js`
  - `game/src/map/petal-field.js`
  - `game/handoff/map-bg/preview.html`
- Do not touch `terrain.js`, `sky.js`, `kit.js`, `port/*` unless a plan
  explicitly says so and the Lead approves.

## How to see the result

The dev server is already running at `http://127.0.0.1:4173`. Render screenshots
with:

```
node game/handoff/map-bg/shoot.mjs "http://127.0.0.1:4173/game/handoff/map-bg/preview.html" "reports/art/<name>.png" gameplay 1400 900 16000
```

`view` can be `gameplay`, `eye`, `shrine`, `lake`, `aerial`. `P` toggles post in
the browser, `1–5` switch views. Save every round's renders under
`reports/art/round-<n>/`.

## The loop

1. **Planner** writes `reports/art/ART-PLAN.md`: a numbered, concrete plan
   (camera numbers, palette values, post uniforms, petal counts/motion, fog
   values) that a designer can implement without guessing. It must include an
   acceptance test ("the render should show X").
2. **Designer** implements the plan, renders round-<n> screenshots, writes
   `reports/art/IMPLEMENTED-<n>.md` (what changed, the numbers, screenshot paths).
3. **Critic** looks at the renders against the reference image and writes
   `reports/art/CRITIQUE-<n>.md`: PASS or FAIL, plus specific, actionable issues
   ranked by impact. It must judge the actual pixels, not the description.
4. If FAIL, the Planner revises the plan using the critique; repeat.
