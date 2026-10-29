// Sunpetal Vale static layout data.
//
// Pure data: no imports, no asset URLs, no gameplay logic. Asset references are
// keys into ASSETS.valley in balance.js. Coordinates follow MAP-DESIGN.md:
// 1 unit = 1 metre, north is -Z, east is +X, ground and feet at Y = 0, hero
// height 1.9. Every walkable surface here sits flush with the ground.
//
// Kenney modular stone and camp props are authored on a 1 m grid, so `scale`
// around 3.0-4.2 makes a doorway read as a real doorway at hero scale.
//
// Measured native bounds (decoded from the GLBs, metres, before scale):
//   stoneBlock  1.00 x 1.00 x 1.00, centred on x/z (a real stone cube)
//   stoneBlockHalf 1.00 x 0.50 x 1.00, centred, sits on the ground
//   stonePillar 0.16 x 1.00 x 0.16 — a thin post, NOT a pier: at any usable
//               scale it reads as a stick, so the shrine does not use it
//   archHalf    0.10 x 1.00 x 1.00, panel offset to x in [0.40, 0.50], leg on +Z
//   stoneBroken 0.12 x 1.00 x 1.00, same panel offset, jagged ruined top
//   stoneHalf   0.10 x 0.50 x 1.00, same panel offset, half-height panel
// The arch half is a QUARTER arch (one haunch: leg + top beam + concave intrados),
// not a full arch, which is what makes a broken arch from a single piece.
//
// The piers are built from stacked stoneBlock cubes, not pillar-stone. A 3.2 m
// pier of 0.51 m square block reads as masonry at hero scale; the 0.16 m post
// read as scaffolding in the first render pass.

// Wishing Arch shrine — centre (0, -31), ~20 x 16 m clearing.
//
// The arch stands behind the clearing centre at z = -36.6 so the path arriving
// from the meadow (+Z) leads up to it. Piers are at x = +/-2.1: 4.2 m apart, and
// with 0.9 m AI colliders that leaves a 2.4 m clear opening — comfortably wider
// than the 1.1 m a hero needs, and wider than the 3.4 m path is long.
//
// The arch span is ONE rotated haunch. With rotY = -PI/2 the piece spans world X
// and its leg lands on the left pier, so the beam runs from the left pier to
// x = +1.1 and simply stops: the right side of the arch is missing, which is the
// broken silhouette the design asks for. No second span is placed.
//
// The pedestal is offset to -X, clear of both the meadow spoke (x = 0) and the
// loop's north-west segment, keeping the central 10 m testing space empty for the
// later spellbook task. It is low and flush with the ground, never raised.
export const SHRINE = {
  centre: { x: 0, z: -31 },
  clearRadius: 10,
  placements: [
    // --- the broken arch: two masonry piers, one surviving haunch ---
    // Piers stand 5.6 m behind the clearing centre so the whole arch, and the
    // 10 m testing space in front of it, stay clear of the reserved area.
    // Each pier is 3 blocks high (3.2 m at scale 1.05) plus a wider base course.
    {
      asset: "stoneBlock", x: -2.1, z: -36.6, y: 0, sx: 1.15, sy: 0.35, sz: 1.15,
      rotY: 0, tint: 0xe6dcbe, collider: 0.85, note: "arch left pier base",
    },
    {
      asset: "stoneBlock", x: -2.1, z: -36.6, y: 0.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch left pier",
    },
    {
      asset: "stoneBlock", x: -2.1, z: -36.6, y: 1.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch left pier",
    },
    {
      asset: "stoneBlock", x: -2.1, z: -36.6, y: 2.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch left pier",
    },
    {
      asset: "stoneBlock", x: 2.1, z: -36.6, y: 0, sx: 1.15, sy: 0.35, sz: 1.15,
      rotY: 0, tint: 0xe6dcbe, collider: 0.85, note: "arch right pier base",
    },
    {
      asset: "stoneBlock", x: 2.1, z: -36.6, y: 0.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch right pier",
    },
    {
      asset: "stoneBlock", x: 2.1, z: -36.6, y: 1.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch right pier",
    },
    {
      asset: "stoneBlock", x: 2.1, z: -36.6, y: 2.35, scale: 1.0, rotY: 0,
      tint: 0xe6dcbe, note: "arch right pier",
    },
    // The single surviving haunch: leg on the left pier, beam across the opening.
    // rotY = -PI/2 maps the piece's local +X (the panel at 0.40..0.50) onto world
    // +Z, so the placement z must be pulled back by 0.45 * scale to bring the
    // panel plane onto the pier centre line (z = -36.6). With scale 3.3 that is
    // 1.485 m. The local +Z leg maps to world -X, landing on the left pier.
    {
      asset: "archHalf", x: -0.45, z: -38.09, y: 3.35, scale: 3.3, rotY: -Math.PI / 2,
      tint: 0xe6dcbe, note: "arch surviving left span",
    },
    // Ruined stub on the right pier where the matching span fell: a broken wall
    // panel standing on the right pier, clearly shorter than the surviving span.
    // Same offset rule at scale 1.3: 0.45 * 1.3 = 0.585 m.
    {
      asset: "stoneBroken", x: 2.1, z: -37.19, y: 3.35, scale: 1.3, rotY: -Math.PI / 2,
      tint: 0xe6dcbe, note: "arch broken right stub",
    },
    // Fallen block at the right pier's foot, tipped into the grass.
    {
      asset: "stoneBlock", x: 4.4, z: -34.2, y: 0, scale: 1.05, rotY: 0.7,
      tint: 0xe6dcbe, collider: 0.9, note: "fallen arch block",
    },

    // --- the empty pedestal, off the walking route ---
    // 6.0 m from the shrine centre, clear of both the meadow spoke and the loop.
    // A wide low plinth: 1.8 x 0.55 x 1.3 m, flush with the ground.
    {
      asset: "stoneBlock", x: -4.2, z: -26.5, y: 0, sx: 1.8, sy: 0.42, sz: 1.3,
      rotY: 0, tint: 0xd9d0b4, collider: 1.0, note: "empty pedestal",
    },
    {
      asset: "stoneBlockHalf", x: -4.2, z: -26.5, y: 0.42, sx: 1.35, sy: 0.26, sz: 1.0,
      rotY: 0, tint: 0xd9d0b4, note: "pedestal cap",
    },

    // --- ruin scatter at the clearing edge, never in the centre ---
    {
      asset: "stoneBroken", x: -9.5, z: -36.0, y: 0, scale: 1.4, rotY: 0.5,
      tint: 0xe0d6b6, collider: 1.1, note: "ruin fragment west",
    },
    {
      asset: "stoneBlock", x: 8.8, z: -37.4, y: 0, sx: 1.5, sy: 0.9, sz: 1.1, rotY: -0.8,
      tint: 0xe0d6b6, collider: 1.0, note: "ruin fragment east",
    },
    {
      asset: "stoneHalf", x: -7.6, z: -38.8, y: 0, scale: 1.8, rotY: 1.2,
      tint: 0xe0d6b6, collider: 0.9, note: "ruin fragment north-west",
    },
  ],
};

// Traveller's rest camp — centre (29, 17), ~18 x 16 m clearing.
// Furniture hugs the outer edge so the middle stays walkable; the path arrives
// from the meadow and the loop passes through (30, 14). The cooking setup is
// UNLIT: no fire, no light — the valley task has no fire effect.
export const CAMP = {
  centre: { x: 29, z: 17 },
  clearRadius: 9,
  placements: [
    {
      asset: "tent", x: 35.0, z: 21.0, y: 0, scale: 4.0, rotY: 2.35,
      collider: 1.7, note: "tent",
    },
    {
      asset: "bedroll", x: 32.0, z: 22.5, y: 0.16, scale: 3.2, rotY: 2.35,
      note: "bedroll",
    },
    {
      asset: "crate", x: 35.8, z: 14.2, y: 0, scale: 4.0, rotY: 0.35,
      collider: 1.0, note: "crate stack base",
    },
    {
      asset: "crate", x: 35.6, z: 13.0, y: 0, scale: 3.1, rotY: -0.4,
      collider: 0.85, note: "crate stack upper",
    },
    {
      asset: "campfire", x: 28.0, z: 23.0, y: 0, scale: 4.2, rotY: 0,
      note: "unlit cooking ring",
    },
    {
      asset: "barrel", x: 36.5, z: 17.5, y: 0, scale: 3.4, rotY: 0.2,
      collider: 0.55, note: "barrel",
    },
    {
      asset: "signpost", x: 24.0, z: 12.5, y: 0, scale: 3.4, rotY: 1.9,
      note: "roadside signpost",
    },
  ],
};

// Route accents: small visual waypoints along the loop shoulders and at landmark
// entrances. Every solid one is at least 3 m off a path centre line and at least
// 6 m from a landmark centre, so the route and the clearings stay open.
export const ACCENTS = [
  { asset: "rock1", x: -6.4, z: 27.4, y: 0, scale: 2.2, rotY: 0.4, collider: 1.2, note: "south loop rock" },
  { asset: "rock3", x: 7.5, z: 31.0, y: 0, scale: 1.8, rotY: 1.1, collider: 1.0, note: "south loop rock" },
  { asset: "stoneHalf", x: -30.5, z: 25.0, y: 0, scale: 1.9, rotY: 0.9, collider: 1.1, note: "petal walk gate stone" },
  { asset: "rock2", x: -36.2, z: 13.4, y: 0, scale: 2.4, rotY: 2.2, collider: 1.3, note: "west loop rock" },
  { asset: "stoneBroken", x: -37.0, z: -16.0, y: 0, scale: 1.5, rotY: -0.6, collider: 1.1, note: "overlook ruin" },
  { asset: "rock1", x: -27.6, z: -33.4, y: 0, scale: 2.0, rotY: 0.2, collider: 1.1, note: "north loop rock" },
  { asset: "signpost", x: -12.0, z: -25.6, y: 0, scale: 3.0, rotY: 0.6, note: "shrine approach sign" },
  { asset: "rock3", x: 19.5, z: -32.0, y: 0, scale: 2.1, rotY: 1.6, collider: 1.1, note: "north-east loop rock" },
  { asset: "stoneHalf", x: 32.8, z: -8.6, y: 0, scale: 1.8, rotY: 0.3, collider: 1.0, note: "east route stone" },
  { asset: "rock2", x: 38.0, z: 4.2, y: 0, scale: 2.0, rotY: 1.4, collider: 1.1, note: "east loop rock" },
  { asset: "pebble", x: -20.0, z: 30.4, y: 0, scale: 2.6, rotY: 0.8, note: "petal walk pebble" },
  { asset: "pebble", x: 12.4, z: 24.6, y: 0, scale: 2.2, rotY: 2.0, note: "meadow edge pebble" },
];

export const LAYOUT = {
  shrine: SHRINE,
  camp: CAMP,
  accents: ACCENTS,
};
